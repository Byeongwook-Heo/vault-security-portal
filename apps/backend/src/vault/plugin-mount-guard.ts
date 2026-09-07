import type {
  VaultInventory,
  VaultInventoryMount,
  VaultPluginCatalogEntry,
  VaultPluginType
} from "@security-portal/shared";

export interface ManagedPluginMountTarget {
  pluginName: string;
  pluginType: VaultPluginType;
  mountPath: string;
}

export interface ManagedPluginMount extends ManagedPluginMountTarget {
  mount: VaultInventoryMount;
  plugin: VaultPluginCatalogEntry;
}

export function normalizeManagedMountPath(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

export function resolveManagedPluginMount(
  inventory: VaultInventory,
  target: ManagedPluginMountTarget
): ManagedPluginMount {
  const mountPath = normalizeManagedMountPath(target.mountPath);
  const expectedKind = target.pluginType === "auth" ? "auth" : "secret";
  const mount = inventory.mounts.find((candidate) => normalizeManagedMountPath(candidate.path) === mountPath);

  if (!mount) {
    throw new Error(`Vault mount ${mountPath} was not found in the live inventory`);
  }
  if (mount.source !== "external") {
    throw new Error(`Vault mount ${mountPath} is not an external custom plugin mount`);
  }
  if (mount.kind !== expectedKind) {
    throw new Error(`Vault mount ${mountPath} no longer matches plugin type ${target.pluginType}`);
  }
  if (mount.type !== target.pluginName) {
    throw new Error(`Vault mount ${mountPath} no longer matches plugin ${target.pluginName}`);
  }

  const plugin = inventory.plugins.find((candidate) =>
    !candidate.builtin &&
    candidate.name === target.pluginName &&
    candidate.pluginType === target.pluginType &&
    candidate.mountedPaths.some((path) => normalizeManagedMountPath(path) === mountPath)
  );
  if (!plugin) {
    throw new Error(`Vault mount ${mountPath} is not linked to the expected custom plugin inventory entry`);
  }

  return {
    pluginName: target.pluginName,
    pluginType: target.pluginType,
    mountPath,
    mount,
    plugin
  };
}
