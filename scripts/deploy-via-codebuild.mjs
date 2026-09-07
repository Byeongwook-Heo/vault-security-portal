#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { BatchGetBuildsCommand, CodeBuildClient, StartBuildCommand } from "@aws-sdk/client-codebuild";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

const terminalStatuses = new Set(["SUCCEEDED", "FAILED", "FAULT", "STOPPED", "TIMED_OUT"]);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseSelection(args) {
  const frontendOnly = args.includes("--frontend-only");
  const backendOnly = args.includes("--backend-only");
  if (frontendOnly && backendOnly) {
    throw new Error("Choose only one of --frontend-only or --backend-only.");
  }
  return {
    frontend: !backendOnly,
    backend: !frontendOnly
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-northeast-2";
  const projectName = process.env.CODEBUILD_PROJECT_NAME ?? "security-portal-test-app-deploy";
  const selection = parseSelection(process.argv.slice(2));
  const sts = new STSClient({ region });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  if (!identity.Account) throw new Error("Unable to determine the AWS account ID.");

  const bucket = process.env.CODEBUILD_SOURCE_BUCKET ?? `security-portal-test-codebuild-source-${identity.Account}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `releases/security-portal-${timestamp}.zip`;
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "security-portal-codebuild-"));
  const archivePath = path.join(temporaryDirectory, "source.zip");

  try {
    console.log("Packaging source without local Docker artifacts or local secrets...");
    await run(
      "zip",
      [
        "-q",
        "-r",
        archivePath,
        ".",
        "-x",
        ".git/*",
        "node_modules/*",
        "*/node_modules/*",
        ".next/*",
        "*/.next/*",
        "dist/*",
        "*/dist/*",
        "coverage/*",
        "*/coverage/*",
        ".terraform/*",
        "*/.terraform/*",
        "*.tfstate",
        "*.tfstate.*",
        "*.tfplan",
        "*.tfvars",
        "*.tfvars.json",
        ".env",
        ".env.*",
        "aws.env",
        "aws.env.*",
        "*.log",
        ".DS_Store"
      ],
      { cwd: projectRoot }
    );

    const s3 = new S3Client({ region });
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await readFile(archivePath),
        ContentType: "application/zip",
        ServerSideEncryption: "AES256"
      })
    );
    console.log(`Uploaded source to s3://${bucket}/${key}.`);

    const codebuild = new CodeBuildClient({ region });
    const start = await codebuild.send(
      new StartBuildCommand({
        projectName,
        sourceTypeOverride: "S3",
        sourceLocationOverride: `${bucket}/${key}`,
        environmentVariablesOverride: [
          { name: "DEPLOY_FRONTEND", value: String(selection.frontend), type: "PLAINTEXT" },
          { name: "DEPLOY_BACKEND", value: String(selection.backend), type: "PLAINTEXT" }
        ]
      })
    );
    const buildId = start.build?.id;
    if (!buildId) throw new Error("CodeBuild did not return a build ID.");
    console.log(`Started ${buildId}.`);

    let previousState = "";
    while (true) {
      const response = await codebuild.send(new BatchGetBuildsCommand({ ids: [buildId] }));
      const build = response.builds?.[0];
      if (!build?.buildStatus) throw new Error(`Unable to read build status for ${buildId}.`);
      const state = `${build.buildStatus}:${build.currentPhase ?? "QUEUED"}`;
      if (state !== previousState) {
        console.log(`CodeBuild ${state}.`);
        previousState = state;
      }
      if (terminalStatuses.has(build.buildStatus)) {
        if (build.logs?.groupName && build.logs?.streamName) {
          console.log(`CloudWatch Logs: ${build.logs.groupName} / ${build.logs.streamName}`);
        }
        if (build.buildStatus !== "SUCCEEDED") {
          throw new Error(`CodeBuild finished with status ${build.buildStatus}.`);
        }
        console.log("AWS build and ECS deployment completed successfully.");
        return;
      }
      await delay(10_000);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
