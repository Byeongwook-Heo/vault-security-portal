#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 7 ]]; then
  echo "Usage: $0 <cluster> <service> <task-family> <container> <image> <build-marker-name> <build-marker-value>" >&2
  exit 2
fi

cluster="$1"
service="$2"
task_family="$3"
container_name="$4"
image_uri="$5"
build_marker_name="$6"
build_marker_value="$7"

task_file="$(mktemp)"
register_file="$(mktemp)"
trap 'rm -f "$task_file" "$register_file"' EXIT

aws ecs describe-task-definition \
  --task-definition "$task_family" \
  --output json >"$task_file"

container_count="$(jq --arg name "$container_name" '[.taskDefinition.containerDefinitions[] | select(.name == $name)] | length' "$task_file")"
if [[ "$container_count" != "1" ]]; then
  echo "Expected one container named ${container_name} in ${task_family}, found ${container_count}." >&2
  exit 1
fi

jq \
  --arg container "$container_name" \
  --arg image "$image_uri" \
  --arg marker "$build_marker_name" \
  --arg marker_value "$build_marker_value" \
  '
    def set_environment_value($name; $value):
      (.environment // []) as $environment
      | .environment = (
          if any($environment[]?; .name == $name) then
            $environment | map(if .name == $name then .value = $value else . end)
          else
            $environment + [{ name: $name, value: $value }]
          end
        );

    .taskDefinition
    | del(
        .taskDefinitionArn,
        .revision,
        .status,
        .requiresAttributes,
        .compatibilities,
        .registeredAt,
        .registeredBy,
        .deregisteredAt
      )
    | .containerDefinitions |= map(
        if .name == $container then
          .image = $image
          | set_environment_value($marker; $marker_value)
        else
          .
        end
      )
  ' "$task_file" >"$register_file"

task_definition_arn="$(
  aws ecs register-task-definition \
    --cli-input-json "file://${register_file}" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text
)"

aws ecs update-service \
  --cluster "$cluster" \
  --service "$service" \
  --task-definition "$task_definition_arn" \
  --output json >/dev/null

echo "Updated ${service} to ${task_definition_arn}."
