import path from "node:path";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const AGENT_RUNTIME_ROOT = path.resolve(process.cwd(), "agent-linux");
const AGENT_RUNTIME_TOP_LEVEL_FILES = [
  "agent.py",
  "requirements.txt",
  "config.example.json",
] as const;
const AGENT_RUNTIME_DIRS = ["agentlx"] as const;

export type AgentRuntimeManifestEntry = {
  path: string;
  sha256: string;
  size: number;
  contentType: string;
};

export type AgentRuntimeManifest = {
  version: 1;
  generatedAt: string;
  files: AgentRuntimeManifestEntry[];
};

function normalizeRuntimePath(relativePath: string) {
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/")).replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized === ".." ||
    normalized.endsWith(".pyc") ||
    normalized.includes("__pycache__/")
  ) {
    throw new Error("Caminho de runtime invalido.");
  }
  return normalized;
}

function contentTypeForRuntimePath(relativePath: string) {
  if (relativePath.endsWith(".py")) {
    return "text/x-python; charset=utf-8";
  }
  if (relativePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

async function listEnterpriseRuntimeExtensionFiles() {
  try {
    const enterprise = await import("@agentlx/enterprise");
    const files = await enterprise.getEnterpriseProvider().agentRuntimeExtensions?.listFiles();
    return (files ?? []).map((file) => ({
      ...file,
      path: normalizeRuntimePath(file.path),
      contentType: file.contentType ?? contentTypeForRuntimePath(file.path),
    }));
  } catch (error) {
    console.warn("[agent-runtime] enterprise extensions unavailable", error);
    return [];
  }
}

async function collectRuntimeFilesFromDir(relativeDir: string): Promise<string[]> {
  const absoluteDir = path.join(AGENT_RUNTIME_ROOT, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "__pycache__") {
      continue;
    }

    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRuntimeFilesFromDir(relativePath)));
      continue;
    }

    if (!entry.isFile() || entry.name.endsWith(".pyc")) {
      continue;
    }

    files.push(relativePath);
  }

  return files;
}

async function listBaseAgentRuntimeFiles() {
  const files: string[] = [...AGENT_RUNTIME_TOP_LEVEL_FILES];

  for (const relativeDir of AGENT_RUNTIME_DIRS) {
    files.push(...(await collectRuntimeFilesFromDir(relativeDir)));
  }

  return files
    .map((item) => normalizeRuntimePath(item))
    .sort((left, right) => left.localeCompare(right, "en"));
}

export async function listAgentRuntimeFiles() {
  const baseFiles = await listBaseAgentRuntimeFiles();
  const extensionFiles = await listEnterpriseRuntimeExtensionFiles();
  const baseFileSet = new Set(baseFiles);
  const extensionPaths = extensionFiles
    .map((item) => item.path)
    .filter((item) => !baseFileSet.has(item));

  return [...baseFiles, ...extensionPaths].sort((left, right) => left.localeCompare(right, "en"));
}

export async function getAgentRuntimeManifest(): Promise<AgentRuntimeManifest> {
  const files = await listAgentRuntimeFiles();
  const extensionFiles = new Map(
    (await listEnterpriseRuntimeExtensionFiles()).map((file) => [file.path, file]),
  );
  const entries = await Promise.all(
    files.map(async (relativePath) => {
      const extensionFile = extensionFiles.get(relativePath);
      const body = extensionFile
        ? Buffer.from(extensionFile.body, "utf8")
        : await readFile(path.join(AGENT_RUNTIME_ROOT, relativePath));
      return {
        path: relativePath,
        sha256: createHash("sha256").update(body).digest("hex"),
        size: body.byteLength,
        contentType: extensionFile?.contentType ?? contentTypeForRuntimePath(relativePath),
      } satisfies AgentRuntimeManifestEntry;
    }),
  );

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    files: entries,
  };
}

export async function readAgentRuntimeFile(relativePath: string) {
  const normalizedPath = normalizeRuntimePath(relativePath);
  const files = await listAgentRuntimeFiles();
  if (!files.includes(normalizedPath)) {
    throw new Error("Arquivo de runtime nao encontrado.");
  }

  const baseFiles = new Set(await listBaseAgentRuntimeFiles());
  if (!baseFiles.has(normalizedPath)) {
    const extensionFile = (await listEnterpriseRuntimeExtensionFiles()).find(
      (file) => file.path === normalizedPath,
    );
    if (!extensionFile) {
      throw new Error("Arquivo de runtime nao encontrado.");
    }
    return {
      path: normalizedPath,
      body: extensionFile.body,
      contentType: extensionFile.contentType ?? contentTypeForRuntimePath(normalizedPath),
    };
  }

  return {
    path: normalizedPath,
    body: await readFile(path.join(AGENT_RUNTIME_ROOT, normalizedPath), "utf8"),
    contentType: contentTypeForRuntimePath(normalizedPath),
  };
}
