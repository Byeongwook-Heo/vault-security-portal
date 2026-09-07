import type { VaultPluginRequirements, VaultPluginTemplate } from "@security-portal/shared";

export function githubPatRotationBackendFile(pluginName: string): string {
  return `package plugin

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/hashicorp/vault/sdk/framework"
	"github.com/hashicorp/vault/sdk/logical"
)

const (
	configStorageKey       = "config"
	patStoragePrefix       = "pat/"
	defaultGitHubAPIBaseURL = "https://api.github.com"
)

var (
	githubHTTPClient = &http.Client{Timeout: 10 * time.Second}
	rotationMu       sync.Mutex
)

type githubConfig struct {
	APIBaseURL   string \`json:"api_base_url"\`
	Organization string \`json:"organization,omitempty"\`
	ExpectedLogin string \`json:"expected_login,omitempty"\`
}

type patRecord struct {
	Token                 string \`json:"token"\`
	TokenType             string \`json:"token_type"\`
	Fingerprint           string \`json:"fingerprint"\`
	Login                 string \`json:"login"\`
	GitHubUserID          int64  \`json:"github_user_id"\`
	ExpiresAt             string \`json:"expires_at,omitempty"\`
	PATID                 string \`json:"pat_id,omitempty"\`
	RotatedAt             string \`json:"rotated_at"\`
	PreviousFingerprint   string \`json:"previous_fingerprint,omitempty"\`
	PreviousRetirement    string \`json:"previous_retirement"\`
}

type githubUser struct {
	Login string \`json:"login"\`
	ID    int64  \`json:"id"\`
}

func BackendFactory(ctx context.Context, conf *logical.BackendConfig) (logical.Backend, error) {
	backend := &framework.Backend{
		Help: "${pluginName} validates and rotates operator-supplied GitHub PATs",
		PathsSpecial: &logical.Paths{
			SealWrapStorage: []string{configStorageKey, patStoragePrefix},
		},
		Paths: []*framework.Path{
			{
				Pattern: "config",
				Fields: configFields(),
				Callbacks: map[logical.Operation]framework.OperationFunc{
					logical.ReadOperation:   readConfig,
					logical.UpdateOperation: updateConfig,
				},
				HelpSynopsis: "Configure the GitHub API endpoint and expected token owner.",
			},
			{
				Pattern: "rotate/" + framework.GenericNameRegex("name"),
				Fields: rotateFields(),
				Callbacks: map[logical.Operation]framework.OperationFunc{
					logical.UpdateOperation: rotatePAT,
				},
				HelpSynopsis: "Validate and select a new GitHub PAT before retiring the previous value.",
			},
			{
				Pattern: "creds/" + framework.GenericNameRegex("name"),
				Fields: namedPATFields(),
				Callbacks: map[logical.Operation]framework.OperationFunc{
					logical.ReadOperation: readCredentials,
				},
				HelpSynopsis: "Read the active PAT. Restrict this path with Vault policy.",
			},
			{
				Pattern: "status/" + framework.GenericNameRegex("name"),
				Fields: namedPATFields(),
				Callbacks: map[logical.Operation]framework.OperationFunc{
					logical.ReadOperation: readPATStatus,
				},
				HelpSynopsis: "Read rotation metadata without exposing the PAT.",
			},
		},
		BackendType: logical.TypeLogical,
	}
	if err := backend.Setup(ctx, conf); err != nil {
		return nil, err
	}
	return backend, nil
}

func AuthFactory(ctx context.Context, conf *logical.BackendConfig) (logical.Backend, error) {
	return BackendFactory(ctx, conf)
}

func configFields() map[string]*framework.FieldSchema {
	return map[string]*framework.FieldSchema{
		"api_base_url": {
			Type:        framework.TypeString,
			Default:     defaultGitHubAPIBaseURL,
			Description: "GitHub.com or GitHub Enterprise API base URL.",
		},
		"organization": {
			Type:        framework.TypeString,
			Description: "Organization whose fine-grained PAT access may be revoked.",
		},
		"expected_login": {
			Type:        framework.TypeString,
			Description: "Expected GitHub login returned by GET /user.",
		},
	}
}

func rotateFields() map[string]*framework.FieldSchema {
	fields := namedPATFields()
	fields["token"] = &framework.FieldSchema{
		Type:        framework.TypeString,
		Required:    true,
		Description: "New operator-supplied GitHub PAT. It is never returned by this operation.",
	}
	fields["expires_at"] = &framework.FieldSchema{
		Type:        framework.TypeString,
		Description: "Optional RFC3339 expiration copied from the GitHub PAT settings.",
	}
	fields["pat_id"] = &framework.FieldSchema{
		Type:        framework.TypeString,
		Description: "Optional organization PAT ID used to retire this token on the next rotation.",
	}
	fields["github_app_token"] = &framework.FieldSchema{
		Type:        framework.TypeString,
		Description: "One-time GitHub App installation token with organization PAT administration permission.",
	}
	return fields
}

func namedPATFields() map[string]*framework.FieldSchema {
	return map[string]*framework.FieldSchema{
		"name": {
			Type:        framework.TypeString,
			Required:    true,
			Description: "Logical name for the rotated PAT.",
		},
	}
}

func updateConfig(ctx context.Context, req *logical.Request, data *framework.FieldData) (*logical.Response, error) {
	config, _, err := loadConfig(ctx, req.Storage)
	if err != nil {
		return nil, err
	}

	if value, ok := rawStringField(data, "api_base_url"); ok {
		config.APIBaseURL = value
	}
	if value, ok := rawStringField(data, "organization"); ok {
		config.Organization = value
	}
	if value, ok := rawStringField(data, "expected_login"); ok {
		config.ExpectedLogin = value
	}

	config.APIBaseURL, err = validateAPIBaseURL(config.APIBaseURL)
	if err != nil {
		return logical.ErrorResponse("invalid api_base_url: %v", err), nil
	}
	entry, err := logical.StorageEntryJSON(configStorageKey, config)
	if err != nil {
		return nil, err
	}
	if err := req.Storage.Put(ctx, entry); err != nil {
		return nil, err
	}
	return configResponse(config, true), nil
}

func readConfig(ctx context.Context, req *logical.Request, _ *framework.FieldData) (*logical.Response, error) {
	config, configured, err := loadConfig(ctx, req.Storage)
	if err != nil {
		return nil, err
	}
	return configResponse(config, configured), nil
}

func configResponse(config githubConfig, configured bool) *logical.Response {
	return &logical.Response{Data: map[string]interface{}{
		"configured":     configured,
		"api_base_url":   config.APIBaseURL,
		"organization":   config.Organization,
		"expected_login": config.ExpectedLogin,
	}}
}

func rotatePAT(ctx context.Context, req *logical.Request, data *framework.FieldData) (*logical.Response, error) {
	name := stringField(data, "name")
	token := stringField(data, "token")
	if name == "" || token == "" {
		return logical.ErrorResponse("name and token are required"), nil
	}

	tokenType := classifyPAT(token)
	if tokenType == "unknown" {
		return logical.ErrorResponse("token must be a fine-grained PAT (github_pat_) or classic PAT (ghp_)"), nil
	}
	patID := stringField(data, "pat_id")
	if patID != "" && !digitsOnly(patID) {
		return logical.ErrorResponse("pat_id must contain digits only"), nil
	}
	expiresAt, err := normalizeExpiration(stringField(data, "expires_at"))
	if err != nil {
		return logical.ErrorResponse("invalid expires_at: %v", err), nil
	}
	rotationMu.Lock()
	defer rotationMu.Unlock()

	config, _, err := loadConfig(ctx, req.Storage)
	if err != nil {
		return nil, err
	}
	user, err := validatePAT(ctx, config.APIBaseURL, token)
	if err != nil {
		return logical.ErrorResponse("GitHub PAT validation failed: %v", err), nil
	}
	if config.ExpectedLogin != "" && !strings.EqualFold(config.ExpectedLogin, user.Login) {
		return logical.ErrorResponse("validated PAT belongs to %q, expected %q", user.Login, config.ExpectedLogin), nil
	}

	fingerprint := tokenFingerprint(token)
	previous, err := readPATRecord(ctx, req.Storage, name)
	if err != nil {
		return nil, err
	}
	if previous != nil && previous.Fingerprint == fingerprint {
		return logical.ErrorResponse("the supplied PAT is already active for %q", name), nil
	}

	now := time.Now().UTC().Format(time.RFC3339)
	record := &patRecord{
		Token:               token,
		TokenType:           tokenType,
		Fingerprint:         fingerprint,
		Login:               user.Login,
		GitHubUserID:        user.ID,
		ExpiresAt:           expiresAt,
		PATID:               patID,
		RotatedAt:           now,
		PreviousRetirement:  "pending",
	}
	if previous != nil {
		record.PreviousFingerprint = shortFingerprint(previous.Fingerprint)
	}

	// Switch the Vault-backed active token before attempting remote retirement.
	if err := writePATRecord(ctx, req.Storage, name, record); err != nil {
		return nil, err
	}
	retirementStatus, warning := retirePreviousPAT(
		ctx,
		config,
		previous,
		stringField(data, "github_app_token"),
	)
	record.PreviousRetirement = retirementStatus
	if err := writePATRecord(ctx, req.Storage, name, record); err != nil {
		return nil, err
	}

	response := &logical.Response{Data: patStatusData(name, record)}
	if warning != "" {
		response.Warnings = []string{warning}
	}
	return response, nil
}

func readCredentials(ctx context.Context, req *logical.Request, data *framework.FieldData) (*logical.Response, error) {
	name := stringField(data, "name")
	record, err := readPATRecord(ctx, req.Storage, name)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return logical.ErrorResponse("no active PAT named %q", name), nil
	}
	result := patStatusData(name, record)
	result["token"] = record.Token
	return &logical.Response{Data: result}, nil
}

func readPATStatus(ctx context.Context, req *logical.Request, data *framework.FieldData) (*logical.Response, error) {
	name := stringField(data, "name")
	record, err := readPATRecord(ctx, req.Storage, name)
	if err != nil {
		return nil, err
	}
	if record == nil {
		return logical.ErrorResponse("no active PAT named %q", name), nil
	}
	return &logical.Response{Data: patStatusData(name, record)}, nil
}

func patStatusData(name string, record *patRecord) map[string]interface{} {
	return map[string]interface{}{
		"name":                  name,
		"login":                 record.Login,
		"github_user_id":        record.GitHubUserID,
		"token_type":            record.TokenType,
		"fingerprint":           shortFingerprint(record.Fingerprint),
		"expires_at":            record.ExpiresAt,
		"pat_id":                record.PATID,
		"rotated_at":            record.RotatedAt,
		"previous_fingerprint":  record.PreviousFingerprint,
		"retirement_status":     record.PreviousRetirement,
	}
}

func loadConfig(ctx context.Context, storage logical.Storage) (githubConfig, bool, error) {
	config := githubConfig{APIBaseURL: defaultGitHubAPIBaseURL}
	entry, err := storage.Get(ctx, configStorageKey)
	if err != nil {
		return config, false, err
	}
	if entry == nil {
		return config, false, nil
	}
	if err := entry.DecodeJSON(&config); err != nil {
		return config, false, err
	}
	if config.APIBaseURL == "" {
		config.APIBaseURL = defaultGitHubAPIBaseURL
	}
	return config, true, nil
}

func writePATRecord(ctx context.Context, storage logical.Storage, name string, record *patRecord) error {
	entry, err := logical.StorageEntryJSON(patStoragePrefix+name, record)
	if err != nil {
		return err
	}
	return storage.Put(ctx, entry)
}

func readPATRecord(ctx context.Context, storage logical.Storage, name string) (*patRecord, error) {
	entry, err := storage.Get(ctx, patStoragePrefix+name)
	if err != nil || entry == nil {
		return nil, err
	}
	var record patRecord
	if err := entry.DecodeJSON(&record); err != nil {
		return nil, err
	}
	return &record, nil
}

func validatePAT(ctx context.Context, apiBaseURL, token string) (*githubUser, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(apiBaseURL, "/")+"/user", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	response, err := githubHTTPClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("GitHub request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("GitHub returned HTTP %d", response.StatusCode)
	}

	var user githubUser
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&user); err != nil {
		return nil, fmt.Errorf("decode GitHub user response: %w", err)
	}
	if user.Login == "" || user.ID == 0 {
		return nil, fmt.Errorf("GitHub user response is missing login or id")
	}
	return &user, nil
}

func retirePreviousPAT(
	ctx context.Context,
	config githubConfig,
	previous *patRecord,
	githubAppToken string,
) (string, string) {
	if previous == nil {
		return "no-previous-token", ""
	}
	if previous.TokenType != "fine-grained" {
		return "manual-revocation-required", "The previous classic PAT must be revoked manually in GitHub."
	}
	if config.Organization == "" || previous.PATID == "" || githubAppToken == "" {
		return "manual-revocation-required", "The previous fine-grained PAT remains active until organization, PAT ID, and a one-time GitHub App administration token are supplied."
	}
	if err := revokeOrganizationAccess(ctx, config.APIBaseURL, config.Organization, previous.PATID, githubAppToken); err != nil {
		return "org-access-revoke-failed", "The new PAT is active, but revoking the previous fine-grained PAT organization access failed: " + err.Error()
	}
	return "org-access-revoked", ""
}

func revokeOrganizationAccess(ctx context.Context, apiBaseURL, organization, patID, githubAppToken string) error {
	payload, err := json.Marshal(map[string]string{"action": "revoke"})
	if err != nil {
		return err
	}
	endpoint := strings.TrimRight(apiBaseURL, "/") + "/orgs/" + url.PathEscape(organization) +
		"/personal-access-tokens/" + url.PathEscape(patID)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+githubAppToken)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	response, err := githubHTTPClient.Do(request)
	if err != nil {
		return fmt.Errorf("GitHub revoke request failed: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("GitHub returned HTTP %d", response.StatusCode)
	}
	return nil
}

func validateAPIBaseURL(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		value = defaultGitHubAPIBaseURL
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" {
		return "", fmt.Errorf("an absolute URL is required")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("userinfo, query strings, and fragments are not allowed")
	}
	if parsed.Scheme != "https" {
		return "", fmt.Errorf("HTTPS is required")
	}
	return strings.TrimRight(value, "/"), nil
}

func classifyPAT(token string) string {
	switch {
	case strings.HasPrefix(token, "github_pat_"):
		return "fine-grained"
	case strings.HasPrefix(token, "ghp_"):
		return "classic"
	default:
		return "unknown"
	}
}

func normalizeExpiration(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return "", err
	}
	if !parsed.After(time.Now()) {
		return "", fmt.Errorf("expiration must be in the future")
	}
	return parsed.UTC().Format(time.RFC3339), nil
}

func tokenFingerprint(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func shortFingerprint(value string) string {
	if len(value) <= 16 {
		return value
	}
	return value[:16]
}

func digitsOnly(value string) bool {
	if value == "" {
		return false
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func rawStringField(data *framework.FieldData, key string) (string, bool) {
	value, ok := data.Raw[key]
	if !ok {
		return "", false
	}
	return strings.TrimSpace(fmt.Sprint(value)), true
}

func stringField(data *framework.FieldData, key string) string {
	value, ok := data.GetOk(key)
	if !ok {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}
`;
}

export function githubPatRotationBackendTestFile(): string {
  return `package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hashicorp/vault/sdk/framework"
	"github.com/hashicorp/vault/sdk/logical"
)

func TestRotatePATSwitchesTokenAndRevokesPreviousOrganizationAccess(t *testing.T) {
	const (
		newToken   = "github_pat_new_test_value"
		appToken   = "github_app_admin_test_value"
		logicalName = "automation"
	)
	revoked := false
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/user":
			if request.Header.Get("Authorization") != "Bearer "+newToken {
				http.Error(writer, "unexpected PAT", http.StatusUnauthorized)
				return
			}
			writer.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(writer).Encode(map[string]interface{}{"login": "octocat", "id": 1})
		case "/orgs/acme/personal-access-tokens/42":
			if request.Method != http.MethodPost || request.Header.Get("Authorization") != "Bearer "+appToken {
				http.Error(writer, "unexpected revoke request", http.StatusUnauthorized)
				return
			}
			var payload map[string]string
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil || payload["action"] != "revoke" {
				http.Error(writer, "unexpected revoke payload", http.StatusBadRequest)
				return
			}
			revoked = true
			writer.WriteHeader(http.StatusNoContent)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()
	previousClient := githubHTTPClient
	githubHTTPClient = server.Client()
	defer func() { githubHTTPClient = previousClient }()

	ctx := context.Background()
	storage := &logical.InmemStorage{}
	request := &logical.Request{Storage: storage}
	if response, err := updateConfig(ctx, request, fieldData(configFields(), map[string]interface{}{
		"api_base_url": server.URL,
		"organization": "acme",
		"expected_login": "octocat",
	})); err != nil || response.IsError() {
		t.Fatalf("configure plugin: response=%#v err=%v", response, err)
	}
	if err := writePATRecord(ctx, storage, logicalName, &patRecord{
		Token: "github_pat_previous_test_value",
		TokenType: "fine-grained",
		Fingerprint: tokenFingerprint("github_pat_previous_test_value"),
		Login: "octocat",
		GitHubUserID: 1,
		PATID: "42",
		RotatedAt: "2026-01-01T00:00:00Z",
		PreviousRetirement: "no-previous-token",
	}); err != nil {
		t.Fatalf("seed previous PAT: %v", err)
	}

	response, err := rotatePAT(ctx, request, fieldData(rotateFields(), map[string]interface{}{
		"name": logicalName,
		"token": newToken,
		"expires_at": "2099-01-01T00:00:00Z",
		"pat_id": "84",
		"github_app_token": appToken,
	}))
	if err != nil || response.IsError() {
		t.Fatalf("rotate PAT: response=%#v err=%v", response, err)
	}
	if !revoked {
		t.Fatal("expected previous fine-grained PAT organization access to be revoked")
	}
	if got := response.Data["retirement_status"]; got != "org-access-revoked" {
		t.Fatalf("unexpected retirement status: %v", got)
	}
	if strings.Contains(fmt.Sprint(response.Data), newToken) {
		t.Fatal("rotation response exposed the PAT")
	}

	credentials, err := readCredentials(ctx, request, fieldData(namedPATFields(), map[string]interface{}{"name": logicalName}))
	if err != nil || credentials.Data["token"] != newToken {
		t.Fatalf("read active credentials: response=%#v err=%v", credentials, err)
	}
	status, err := readPATStatus(ctx, request, fieldData(namedPATFields(), map[string]interface{}{"name": logicalName}))
	if err != nil {
		t.Fatalf("read status: %v", err)
	}
	if _, exposed := status.Data["token"]; exposed {
		t.Fatal("status response exposed the PAT")
	}
	stored, err := storage.Get(ctx, patStoragePrefix+logicalName)
	if err != nil {
		t.Fatalf("read stored PAT: %v", err)
	}
	if strings.Contains(string(stored.Value), appToken) {
		t.Fatal("one-time GitHub App token was persisted")
	}
}

func TestClassicPATRequiresManualPreviousRevocation(t *testing.T) {
	const newToken = "github_pat_next_test_value"
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]interface{}{"login": "octocat", "id": 1})
	}))
	defer server.Close()
	previousClient := githubHTTPClient
	githubHTTPClient = server.Client()
	defer func() { githubHTTPClient = previousClient }()

	ctx := context.Background()
	storage := &logical.InmemStorage{}
	request := &logical.Request{Storage: storage}
	if response, err := updateConfig(ctx, request, fieldData(configFields(), map[string]interface{}{"api_base_url": server.URL})); err != nil || response.IsError() {
		t.Fatalf("configure plugin: response=%#v err=%v", response, err)
	}
	if err := writePATRecord(ctx, storage, "legacy", &patRecord{
		Token: "ghp_previous_test_value",
		TokenType: "classic",
		Fingerprint: tokenFingerprint("ghp_previous_test_value"),
		Login: "octocat",
		GitHubUserID: 1,
		RotatedAt: "2026-01-01T00:00:00Z",
		PreviousRetirement: "no-previous-token",
	}); err != nil {
		t.Fatalf("seed classic PAT: %v", err)
	}

	response, err := rotatePAT(ctx, request, fieldData(rotateFields(), map[string]interface{}{
		"name": "legacy",
		"token": newToken,
	}))
	if err != nil || response.IsError() {
		t.Fatalf("rotate PAT: response=%#v err=%v", response, err)
	}
	if got := response.Data["retirement_status"]; got != "manual-revocation-required" {
		t.Fatalf("unexpected retirement status: %v", got)
	}
	if len(response.Warnings) != 1 || !strings.Contains(response.Warnings[0], "classic PAT") {
		t.Fatalf("expected a manual revocation warning, got %#v", response.Warnings)
	}
}

func fieldData(schema map[string]*framework.FieldSchema, raw map[string]interface{}) *framework.FieldData {
	return &framework.FieldData{Raw: raw, Schema: schema}
}
`;
}

export function githubPatRotationReadmeFile({
  template,
  pluginName,
  mountPath,
  version,
  command,
  description,
  requirements
}: {
  template: VaultPluginTemplate;
  pluginName: string;
  mountPath: string;
  version: string;
  command: string;
  description: string;
  requirements: VaultPluginRequirements;
}): string {
  return `# ${pluginName}

${description}

Generated by Vault Plugin Factory from the built-in \`${template.displayName}\` template.

## Scope

This secrets engine validates an operator-supplied GitHub PAT with \`GET /user\`, stores it in Vault barrier-encrypted and seal-wrapped storage, switches the named active credential, and records retirement status for the previous PAT.

It does **not** create a PAT. GitHub.com requires the user to create fine-grained PATs through GitHub settings. Start from the pre-filled form at <https://github.com/settings/personal-access-tokens/new?name=Vault%20Factory%20Rotation>.

- Fine-grained PAT: when an organization, previous PAT ID, and one-time GitHub App administration token are supplied, the plugin revokes the previous PAT's access to that organization.
- Classic PAT: the plugin switches the active Vault value, but the previous PAT must be revoked manually in GitHub.
- The \`rotate\` and \`status\` responses never return the PAT. Only policy-authorized reads of \`creds/<name>\` return it.

## Confirmed requirements

- Target system: ${requirements.targetSystem}
- Authentication: ${requirements.authMethod}
- API path: ${requirements.apiBasePath}
- TTL: ${requirements.ttl}
- Rotation: ${requirements.rotationStrategy}
- Revoke: ${requirements.revokeStrategy}
- Mount: ${requirements.mountPath}/
- First environment: ${requirements.environment}

## Build

\`\`\`bash
go mod tidy
go test ./...
mkdir -p dist
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o dist/${command} ./cmd/${pluginName}
PLUGIN_SHA=$(sha256sum dist/${command} | awk '{print $1;}')
\`\`\`

## Register and enable

\`\`\`bash
vault plugin register -command=${command} -sha256=$PLUGIN_SHA -version=${version} secret ${pluginName}
vault secrets enable -path=${mountPath} ${pluginName}
\`\`\`

## Configure and rotate

\`\`\`bash
vault write ${mountPath}/config \\
  api_base_url="https://api.github.com" \\
  organization="example-org" \\
  expected_login="example-user"

# Use Vault CLI file loading so PAT values do not appear in shell history.
vault write ${mountPath}/rotate/automation \\
  token=@/secure/path/new-github-pat \\
  expires_at="2099-01-01T00:00:00Z" \\
  pat_id="123456" \\
  github_app_token=@/secure/path/one-time-github-app-token

vault read ${mountPath}/status/automation
vault read -field=token ${mountPath}/creds/automation
\`\`\`

The optional \`pat_id\` is the organization's identifier for the new fine-grained PAT. It is retained so the next rotation can request organization-access revocation. The optional \`github_app_token\` is used once and is never stored.

## Production guardrails

${template.guardrails.map((guardrail) => `- ${guardrail}`).join("\n")}

## GitHub references

- <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens>
- <https://docs.github.com/en/rest/orgs/personal-access-tokens>
`;
}
