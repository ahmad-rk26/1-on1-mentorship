'use client';
import { useState, useRef, useEffect } from 'react';

export interface FileNode {
    id: string;
    name: string;
    type: 'file' | 'folder';
    language?: string;
    content?: string;
    children?: FileNode[];
    parentId?: string | null;
}

interface Props {
    tree: FileNode[];
    activeFileId: string | null;
    onFileSelect: (file: FileNode) => void;
    onCreateFile: (parentId: string | null, name: string) => void;
    onCreateFolder: (parentId: string | null, name: string) => void;
    onRename: (id: string, newName: string) => void;
    onDelete: (id: string) => void;
    readOnly: boolean;
    sessionTitle: string;
}

export default function FileExplorer({
    tree, activeFileId, onFileSelect, onCreateFile, onCreateFolder, onRename, onDelete, readOnly, sessionTitle
}: Props) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set(['root']));
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null);
    const [inlineInput, setInlineInput] = useState<{ parentId: string | null; type: 'file' | 'folder' } | null>(null);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [inputVal, setInputVal] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inlineInput || renaming) setTimeout(() => inputRef.current?.focus(), 50);
    }, [inlineInput, renaming]);

    // Close context menu on outside click
    useEffect(() => {
        const close = () => setContextMenu(null);
        window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, []);

    function toggleExpand(id: string) {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function commitInput() {
        const val = inputVal.trim();
        if (!val) { setInlineInput(null); setRenaming(null); setInputVal(''); return; }
        if (renaming) { onRename(renaming, val); setRenaming(null); }
        else if (inlineInput) {
            if (inlineInput.type === 'file') onCreateFile(inlineInput.parentId, val);
            else onCreateFolder(inlineInput.parentId, val);
            setInlineInput(null);
        }
        setInputVal('');
    }

    function startRename(node: FileNode) {
        setRenaming(node.id);
        setInputVal(node.name);
        setContextMenu(null);
    }

    function startCreate(parentId: string | null, type: 'file' | 'folder') {
        if (parentId) setExpanded(p => new Set([...p, parentId]));
        setInlineInput({ parentId, type });
        setInputVal('');
        setContextMenu(null);
    }

    function handleContextMenu(e: React.MouseEvent, node: FileNode | null) {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, node });
    }

    function getFileIcon(name: string) {
        const ext = name.split('.').pop()?.toLowerCase() ?? '';
        const map: Record<string, { icon: string; color: string }> = {
            js: { icon: 'JS', color: '#f7df1e' },
            ts: { icon: 'TS', color: '#3178c6' },
            tsx: { icon: 'TX', color: '#61dafb' },
            jsx: { icon: 'JX', color: '#61dafb' },
            py: { icon: 'PY', color: '#3572a5' },
            java: { icon: 'JV', color: '#b07219' },
            cpp: { icon: 'C+', color: '#f34b7d' },
            c: { icon: 'C', color: '#555555' },
            go: { icon: 'GO', color: '#00add8' },
            rs: { icon: 'RS', color: '#dea584' },
            html: { icon: 'HT', color: '#e34c26' },
            css: { icon: 'CS', color: '#563d7c' },
            json: { icon: '{}', color: '#cbcb41' },
            md: { icon: 'MD', color: '#083fa1' },
        };
        return map[ext] ?? { icon: '  ', color: '#7d8590' };
    }

    function renderNode(node: FileNode, depth = 0): React.ReactNode {
        const isExpanded = expanded.has(node.id);
        const isActive = activeFileId === node.id;
        const isFolder = node.type === 'folder';
        const fileIcon = !isFolder ? getFileIcon(node.name) : null;

        return (
            <div key={node.id}>
                {/* Node row */}
                <div
                    className="group flex items-center gap-1 cursor-pointer select-none relative"
                    style={{
                        paddingLeft: `${depth * 12 + 8}px`,
                        paddingRight: '8px',
                        height: '24px',
                        background: isActive ? 'rgba(124,58,237,0.2)' : 'transparent',
                        borderLeft: isActive ? '2px solid #7c3aed' : '2px solid transparent',
                    }}
                    onClick={() => {
                        if (isFolder) toggleExpand(node.id);
                        else onFileSelect(node);
                    }}
                    onContextMenu={e => handleContextMenu(e, node)}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                    {/* Expand arrow for folders */}
                    {isFolder ? (
                        <span className="shrink-0 text-[10px] w-3 text-center" style={{ color: '#7d8590' }}>
                            {isExpanded ? '▾' : '▸'}
                        </span>
                    ) : <span className="w-3 shrink-0" />}

                    {/* Icon */}
                    {isFolder ? (
                        <span className="text-[13px] shrink-0">{isExpanded ? '📂' : '📁'}</span>
                    ) : (
                        <span className="shrink-0 text-[9px] font-black w-5 h-4 flex items-center justify-center rounded-sm"
                            style={{ background: `${fileIcon!.color}22`, color: fileIcon!.color }}>
                            {fileIcon!.icon}
                        </span>
                    )}

                    {/* Name or rename input */}
                    {renaming === node.id ? (
                        <input ref={inputRef} value={inputVal} onChange={e => setInputVal(e.target.value)}
                            onBlur={commitInput}
                            onKeyDown={e => { if (e.key === 'Enter') commitInput(); if (e.key === 'Escape') { setRenaming(null); setInputVal(''); } }}
                            className="flex-1 text-[12px] outline-none px-1 rounded"
                            style={{ background: '#1e3a5f', border: '1px solid #3b82f6', color: 'white', minWidth: 0 }}
                            onClick={e => e.stopPropagation()} />
                    ) : (
                        <span className="flex-1 text-[12px] truncate" style={{ color: isActive ? 'white' : '#c9d1d9' }}>
                            {node.name}
                        </span>
                    )}

                    {/* Hover action buttons (mentor only) */}
                    {!readOnly && renaming !== node.id && (
                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                            {isFolder && (
                                <>
                                    <ActionBtn title="New File" onClick={e => { e.stopPropagation(); startCreate(node.id, 'file'); }}>
                                        <NewFileIcon />
                                    </ActionBtn>
                                    <ActionBtn title="New Folder" onClick={e => { e.stopPropagation(); startCreate(node.id, 'folder'); }}>
                                        <NewFolderIcon />
                                    </ActionBtn>
                                </>
                            )}
                            <ActionBtn title="Rename" onClick={e => { e.stopPropagation(); startRename(node); }}>
                                <RenameIcon />
                            </ActionBtn>
                            <ActionBtn title="Delete" onClick={e => { e.stopPropagation(); onDelete(node.id); }} danger>
                                <DeleteIcon />
                            </ActionBtn>
                        </div>
                    )}
                </div>

                {/* Inline input for new file/folder inside this folder */}
                {inlineInput && inlineInput.parentId === node.id && (
                    <InlineInput
                        depth={depth + 1}
                        type={inlineInput.type}
                        inputRef={inputRef}
                        value={inputVal}
                        onChange={setInputVal}
                        onCommit={commitInput}
                        onCancel={() => { setInlineInput(null); setInputVal(''); }}
                    />
                )}

                {/* Children */}
                {isFolder && isExpanded && node.children?.map(child => renderNode(child, depth + 1))}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ background: '#0d1117' }}>
            {/* Explorer header */}
            <div className="flex items-center justify-between px-3 h-9 shrink-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#7d8590' }}>
                    Explorer
                </span>
                {!readOnly && (
                    <div className="flex items-center gap-0.5">
                        <ActionBtn title="New File" onClick={() => startCreate(null, 'file')}><NewFileIcon /></ActionBtn>
                        <ActionBtn title="New Folder" onClick={() => startCreate(null, 'folder')}><NewFolderIcon /></ActionBtn>
                    </div>
                )}
            </div>

            {/* Project name */}
            <div className="flex items-center gap-2 px-3 h-8 shrink-0 cursor-pointer"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                onContextMenu={e => handleContextMenu(e, null)}>
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: '#7d8590' }}>
                    {sessionTitle}
                </span>
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-y-auto py-1" onContextMenu={e => handleContextMenu(e, null)}>
                {tree.map(node => renderNode(node))}

                {/* Root-level inline input */}
                {inlineInput && inlineInput.parentId === null && (
                    <InlineInput
                        depth={0}
                        type={inlineInput.type}
                        inputRef={inputRef}
                        value={inputVal}
                        onChange={setInputVal}
                        onCommit={commitInput}
                        onCancel={() => { setInlineInput(null); setInputVal(''); }}
                    />
                )}

                {tree.length === 0 && !inlineInput && (
                    <div className="px-4 py-6 text-center">
                        <p className="text-[11px]" style={{ color: '#7d8590' }}>
                            {readOnly ? 'No files yet' : 'No files yet.\nClick + to create one.'}
                        </p>
                    </div>
                )}
            </div>

            {/* Context menu */}
            {contextMenu && (
                <div className="fixed z-50 rounded-xl overflow-hidden shadow-2xl py-1"
                    style={{ top: contextMenu.y, left: contextMenu.x, background: '#1c2128', border: '1px solid rgba(255,255,255,0.1)', minWidth: 180 }}
                    onClick={e => e.stopPropagation()}>
                    {contextMenu.node?.type === 'folder' || !contextMenu.node ? (
                        <>
                            <CtxItem icon={<NewFileIcon />} label="New File" onClick={() => startCreate(contextMenu.node?.id ?? null, 'file')} />
                            <CtxItem icon={<NewFolderIcon />} label="New Folder" onClick={() => startCreate(contextMenu.node?.id ?? null, 'folder')} />
                        </>
                    ) : null}
                    {contextMenu.node && (
                        <>
                            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                            <CtxItem icon={<RenameIcon />} label="Rename" onClick={() => startRename(contextMenu.node!)} />
                            <CtxItem icon={<DeleteIcon />} label="Delete" onClick={() => { onDelete(contextMenu.node!.id); setContextMenu(null); }} danger />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function InlineInput({ depth, type, inputRef, value, onChange, onCommit, onCancel }: {
    depth: number; type: 'file' | 'folder';
    inputRef: React.RefObject<HTMLInputElement | null>;
    value: string; onChange: (v: string) => void;
    onCommit: () => void; onCancel: () => void;
}) {
    return (
        <div className="flex items-center gap-1.5 h-6" style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: '8px' }}>
            <span className="text-[13px] shrink-0">{type === 'folder' ? '📁' : '📄'}</span>
            <input ref={inputRef} value={value} onChange={e => onChange(e.target.value)}
                onBlur={onCommit}
                onKeyDown={e => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCancel(); }}
                placeholder={type === 'file' ? 'filename.js' : 'folder name'}
                className="flex-1 text-[12px] outline-none px-1.5 py-0.5 rounded"
                style={{ background: '#1e3a5f', border: '1px solid #3b82f6', color: 'white', minWidth: 0 }} />
        </div>
    );
}

function ActionBtn({ title, onClick, danger, children }: { title: string; onClick: (e: React.MouseEvent) => void; danger?: boolean; children: React.ReactNode }) {
    return (
        <button title={title} onClick={onClick}
            className="w-5 h-5 rounded flex items-center justify-center transition-colors"
            style={{ color: danger ? '#f85149' : '#7d8590' }}
            onMouseEnter={e => (e.currentTarget.style.color = danger ? '#ff7b72' : 'white')}
            onMouseLeave={e => (e.currentTarget.style.color = danger ? '#f85149' : '#7d8590')}>
            {children}
        </button>
    );
}

function CtxItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
    return (
        <button onClick={onClick}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] transition-colors text-left"
            style={{ color: danger ? '#f85149' : '#c9d1d9' }}
            onMouseEnter={e => (e.currentTarget.style.background = danger ? 'rgba(248,81,73,0.1)' : 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <span style={{ color: danger ? '#f85149' : '#7d8590' }}>{icon}</span>
            {label}
        </button>
    );
}

// Icons
function NewFileIcon() { return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 1h6l3 3v8H2V1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /><path d="M8 1v3h3M5 7h3M5 9h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /><path d="M9 10l1.5 1.5M10.5 10L9 11.5" stroke="#6ee7b7" strokeWidth="1.1" strokeLinecap="round" /></svg>; }
function NewFolderIcon() { return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 3h4l1.5 1.5H12v7H1V3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /><path d="M7 8l1.5 1.5M8.5 8L7 9.5" stroke="#6ee7b7" strokeWidth="1.1" strokeLinecap="round" /></svg>; }
function RenameIcon() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 9.5h8M7.5 2.5l2 2-5 5H2.5v-2l5-5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></svg>; }
function DeleteIcon() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
