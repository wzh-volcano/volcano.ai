import { Suspense } from 'react';
import { getPluginComponents } from '@/lib/plugin-registry';
import { Loader2 } from 'lucide-react';

interface PluginOutletProps {
  extensionPoint: string;
  pluginName?: string;
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-4 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin mr-2" />
      <span className="text-sm">加载插件中...</span>
    </div>
  );
}

export function PluginOutlet({ extensionPoint, pluginName }: PluginOutletProps) {
  const components = getPluginComponents(extensionPoint, pluginName);

  if (components.length === 0) return null;

  return (
    <>
      {components.map(comp => (
        <Suspense key={`${comp.pluginName}-${comp.key}`} fallback={<Loading />}>
          <comp.component pluginName={comp.pluginName} />
        </Suspense>
      ))}
    </>
  );
}
