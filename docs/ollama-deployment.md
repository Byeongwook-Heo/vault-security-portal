# Ollama GPU Deployment

## Topology

```text
Browser
  -> Application Load Balancer
  -> ECS backend
  -> private port 11434, bearer-authenticated Nginx
  -> loopback port 11435, Ollama
  -> NVIDIA L4 GPU
```

- The Ollama EC2 instance has no public IP and runs in a private subnet.
- Security group ingress on port `11434` accepts traffic only from the ECS security group.
- Ollama itself binds to `127.0.0.1:11435`.
- Nginx validates a bearer token stored in AWS Secrets Manager before proxying a request.
- The ECS execution role reads the token and injects it into the backend task as a secret.

## Current Test Environment

```text
Region: ap-northeast-2
Instance type: g6.xlarge
GPU: NVIDIA L4, 23034 MiB
Architecture: x86_64
Root volume: 100 GiB encrypted gp3
Ollama: 0.31.2
Model: qwen3:8b
```

The Terraform entry point is `infra/aws/terraform/ollama.tf`. Bootstrap logic is in `infra/aws/terraform/templates/ollama-user-data.sh.tftpl`.

## Bootstrap Sequence

1. Install the NVIDIA data-center driver and required kernel headers.
2. Install AWS CLI, Ollama, Nginx, and the SSM agent.
3. Bind Ollama to loopback and configure the model volume.
4. Read the proxy token from Secrets Manager without printing it.
5. Configure Nginx on private port `11434`.
6. Reboot once if the NVIDIA kernel driver is not loaded.
7. Pull the configured model through Ollama's HTTP API.
8. Write `/var/lib/ollama-bootstrap/ready` after GPU and model validation succeeds.

## Runtime Verification

From the portal path:

```bash
curl http://service.example.invalid/api/health/llm
```

Expected result:

```json
{"ok":true,"provider":"ollama","model":"qwen3:8b","modelAvailable":true}
```

On the instance through AWS Systems Manager, verify:

```bash
nvidia-smi
systemctl is-active ollama nginx ollama-model-bootstrap
curl -fsS http://127.0.0.1:11435/api/tags | jq '.models[].name'
cat /var/lib/ollama-bootstrap/ready
```

An unauthenticated request to `http://127.0.0.1:11434/api/tags` must return `401`.

## Failure Behavior

- If Ollama is unreachable, the backend returns the deterministic rules fallback for catalog, generation, apply, and rollback commands.
- The UI status changes from `Ollama - qwen3:8b` to the fallback state.
- General conversational answers require Ollama; the fallback intentionally does not invent an answer.
- Plugin generation remains available because scaffold generation is performed by the portal backend, not by the model.

## Cost Control

The GPU instance incurs compute charges while it is running. Stopping it preserves the encrypted EBS volume and downloaded model but does not stop EBS charges. After restarting the instance, wait for EC2 status checks, SSM, and `/api/health/llm` before testing chat.

Destroying the Terraform environment removes the instance and its root volume. Take a snapshot first only when the downloaded model or local runtime state must be retained.

## Vault Boundary

The deployed backend still uses mock Vault mode. Plugin Factory can generate, validate, preview, and exercise the guarded apply workflow, but it does not register binaries with a production Vault cluster until the real Vault integration is configured.
