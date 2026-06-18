import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Download } from 'lucide-react';
import { api } from '@/lib/api';
import type { MarketServer } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export const MarketImportModal: React.FC<Props> = ({ open, onOpenChange, onImported }) => {
  const [query, setQuery] = useState('');
  const [servers, setServers] = useState<MarketServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MarketServer | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const cursorRef = useRef('');
  const listRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (newSearch?: boolean) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    if (newSearch) { setServers([]); setSelected(null); cursorRef.current = ''; }
    try {
      const c = newSearch ? undefined : cursorRef.current;
      const result = await api.searchMarketplace(query, c);
      setServers(prev => newSearch ? result.servers : [...prev, ...result.servers]);
      cursorRef.current = result.nextCursor;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleScroll = useCallback(() => {
    if (!listRef.current || loading || !cursorRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      search();
    }
  }, [loading, search]);

  const handleImport = async (server: MarketServer) => {
    setImporting(server.name);
    setError(null);
    try {
      const result = await api.importFromMarketplace(server.name, server.version, envValues);
      if (result.error) {
        setError(result.error);
        return;
      }
      onImported();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(null);
    }
  };

  useEffect(() => {
    if (!open) {
      setQuery('');
      setServers([]);
      setSelected(null);
      setError(null);
      setEnvValues({});
      cursorRef.current = '';
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>从 MCP 市场导入</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="搜索 MCP Server..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search(true)}
          />
          <Button onClick={() => search(true)} disabled={loading || !query.trim()}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            搜索
          </Button>
        </div>

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        <div className="flex gap-4 flex-1 min-h-0">
          <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto space-y-2 pr-2">
            {servers.length === 0 && !loading && query && (
              <p className="text-text-mute text-sm text-center py-8">No results</p>
            )}
            {servers.map(s => (
              <div
                key={s.name + s.version}
                className={
                  'p-3 rounded-lg border cursor-pointer transition-colors ' +
                  (selected?.name === s.name ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50')
                }
                onClick={() => { setSelected(s); setEnvValues({}); }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{s.title || s.name}</p>
                    <p className="text-xs text-text-mute mt-0.5">
                      {s.description?.slice(0, 80)}{s.description?.length > 80 ? '...' : ''}
                    </p>
                  </div>
                  <span className={
                    'text-xs px-2 py-0.5 rounded-full ' +
                    (s.packageType === 'npm' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')
                  }>
                    {s.packageType}
                  </span>
                </div>
                <div className="flex gap-2 mt-1.5 text-xs text-text-mute">
                  <span>v{s.version}</span>
                  <span>{s.transport}</span>
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin" /></div>}
          </div>

          {selected && (
            <div className="w-72 shrink-0 border-l border-border pl-4 overflow-y-auto">
              <h3 className="font-medium text-sm">{selected.title || selected.name}</h3>
              <p className="text-xs text-text-mute mt-1">{selected.description}</p>

              <div className="mt-3 text-xs space-y-1 text-text-mute">
                <p>Version: <span className="text-text">{selected.version}</span></p>
                <p>Package: <span className="text-text">{selected.packageType}</span></p>
                <p>Transport: <span className="text-text">{selected.transport}</span></p>
              </div>

              {selected.envVars.filter(v => v.required).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium mb-2">Environment Variables</p>
                  {selected.envVars.filter(v => v.required).map(ev => (
                    <div key={ev.name} className="mb-2">
                      <label className="text-xs text-text-mute block mb-0.5">
                        {ev.name} {ev.description && <span className="italic">— {ev.description}</span>}
                      </label>
                      <Input
                        type={ev.secret ? 'password' : 'text'}
                        placeholder={ev.name}
                        value={envValues[ev.name] || ''}
                        onChange={e => setEnvValues(prev => ({ ...prev, [ev.name]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              <Button
                size="sm"
                className="w-full mt-4"
                onClick={() => handleImport(selected)}
                disabled={importing === selected.name}
              >
                {importing === selected.name ? (
                  <><Loader2 size={14} className="animate-spin mr-1" /> 导入中...</>
                ) : (
                  <><Download size={14} className="mr-1" /> 导入并安装</>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
