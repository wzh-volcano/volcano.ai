import React from 'react';

export interface PluginComponent {
  key: string;
  pluginName: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  extensionPoint: string;
}

const registry = new Map<string, PluginComponent[]>();

export function registerPluginComponent(comp: PluginComponent): void {
  const list = registry.get(comp.extensionPoint) || [];
  list.push(comp);
  registry.set(comp.extensionPoint, list);
}

export function getPluginComponents(
  point: string, pluginName?: string
): PluginComponent[] {
  const list = registry.get(point) || [];
  if (pluginName) {
    return list.filter(c => c.pluginName === pluginName);
  }
  return list;
}

export function clearPluginComponents(pluginName: string): void {
  for (const [point, list] of registry.entries()) {
    registry.set(point, list.filter(c => c.pluginName !== pluginName));
  }
}
