import { Router, Request, Response } from 'express';
import { execFile, exec as execShell } from 'child_process';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const router = Router();
const TIMEOUT_MS = 15_000;

interface RunResult { stdout: string; stderr: string; exitCode: number; }

// ── Promisified local exec ─────────────────────────────────────────────────────
function execLocal(cmd: string, args: string[], cwd?: string): Promise<RunResult> {
    return new Promise((resolve) => {
        execFile(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: 1024 * 512, cwd }, (err, stdout, stderr) => {
            resolve({
                stdout: stdout ?? '',
                stderr: stderr ?? (err?.killed ? `Timed out after ${TIMEOUT_MS / 1000}s` : ''),
                exitCode: (err?.code as number) ?? 0,
            });
        });
    });
}

// Check if a command exists on PATH
function commandExists(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
        const check = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
        execShell(check, (err) => resolve(!err));
    });
}

// ── JDoodle API fallback (200 free credits/day) ───────────────────────────────
// Sign up free at https://www.jdoodle.com/compiler-api/
// Add JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET to backend/.env
const JDOODLE_LANG: Record<string, { language: string; versionIndex: string }> = {
    java: { language: 'java', versionIndex: '4' },
    cpp: { language: 'cpp17', versionIndex: '1' },
    c: { language: 'c', versionIndex: '5' },
    go: { language: 'go', versionIndex: '4' },
    rust: { language: 'rust', versionIndex: '4' },
    python: { language: 'python3', versionIndex: '4' },
    typescript: { language: 'typescript', versionIndex: '1' },
};

async function runViaJDoodle(language: string, code: string): Promise<RunResult> {
    const clientId = process.env.JDOODLE_CLIENT_ID;
    const clientSecret = process.env.JDOODLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return {
            stdout: '',
            stderr: [
                `Runtime not installed locally for: ${language}`,
                '',
                'To enable cloud execution for Java / C++ / Go / Rust:',
                '  1. Sign up free at https://www.jdoodle.com/compiler-api/',
                '  2. Get your Client ID and Client Secret',
                '  3. Add to backend/.env:',
                '       JDOODLE_CLIENT_ID=your_id',
                '       JDOODLE_CLIENT_SECRET=your_secret',
                '  4. Restart the backend',
            ].join('\n'),
            exitCode: 1,
        };
    }

    const cfg = JDOODLE_LANG[language];
    if (!cfg) return { stdout: '', stderr: `Unsupported language: ${language}`, exitCode: 1 };

    try {
        const res = await fetch('https://api.jdoodle.com/v1/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId,
                clientSecret,
                script: code,
                language: cfg.language,
                versionIndex: cfg.versionIndex,
            }),
        });
        const data = await res.json() as {
            output?: string; statusCode?: number; error?: string; memory?: string; cpuTime?: string;
        };

        if (!res.ok || data.statusCode !== 200) {
            return { stdout: '', stderr: data.error ?? data.output ?? 'JDoodle error', exitCode: 1 };
        }

        const out = data.output ?? '';
        // JDoodle puts compile errors in output with non-zero exit
        return { stdout: out, stderr: '', exitCode: 0 };
    } catch (err: any) {
        return { stdout: '', stderr: `JDoodle request failed: ${err.message}`, exitCode: 1 };
    }
}

// ── Main route ────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
    const { language, code } = req.body as { language: string; code: string };
    if (!language || !code) return res.status(400).json({ error: 'language and code are required' });

    const dir = join(tmpdir(), `ms-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    const cleanup = () => { try { rmSync(dir, { recursive: true, force: true }); } catch { } };

    try {
        let result: RunResult;

        switch (language) {

            // ── JavaScript — Node always available ──────────────────────────
            case 'javascript': {
                const file = join(dir, 'main.js');
                writeFileSync(file, code);
                result = await execLocal('node', [file]);
                cleanup();
                break;
            }

            // ── TypeScript — write isolated tsconfig + run via ts-node ─────
            case 'typescript': {
                const file = join(dir, 'main.ts');
                writeFileSync(file, code);
                // Write a minimal tsconfig so ts-node doesn't inherit the backend's config
                writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
                    compilerOptions: {
                        module: 'commonjs',
                        moduleResolution: 'node',
                        target: 'es2020',
                        strict: false,
                        esModuleInterop: true,
                        skipLibCheck: true,
                    }
                }));
                const tsNodeScript = join(__dirname, '../../node_modules/ts-node/dist/bin.js');
                result = await execLocal('node', [tsNodeScript, '--transpile-only', file], dir);
                cleanup();
                break;
            }

            // ── Python — try local first, fallback to JDoodle ───────────────
            case 'python': {
                const file = join(dir, 'main.py');
                writeFileSync(file, code);
                const hasPy = await commandExists('python');
                const hasPy3 = await commandExists('python3');
                if (hasPy || hasPy3) {
                    result = await execLocal(hasPy ? 'python' : 'python3', [file]);
                } else {
                    result = await runViaJDoodle('python', code);
                }
                cleanup();
                break;
            }

            // ── Java — try local javac/java, fallback to JDoodle ────────────
            case 'java': {
                const hasJava = await commandExists('javac');
                if (hasJava) {
                    const classMatch = code.match(/public\s+class\s+(\w+)/);
                    const className = classMatch?.[1] ?? 'Main';
                    const file = join(dir, `${className}.java`);
                    writeFileSync(file, code);
                    const compile = await execLocal('javac', [file], dir);
                    if (compile.exitCode !== 0 || compile.stderr) {
                        result = { stdout: '', stderr: compile.stderr || compile.stdout, exitCode: 1 };
                    } else {
                        result = await execLocal('java', ['-cp', dir, className]);
                    }
                    cleanup();
                } else {
                    cleanup();
                    result = await runViaJDoodle('java', code);
                }
                break;
            }

            // ── C++ — try local g++, fallback to JDoodle ────────────────────
            case 'cpp': {
                const hasGpp = await commandExists('g++');
                if (hasGpp) {
                    const src = join(dir, 'main.cpp');
                    const out = join(dir, process.platform === 'win32' ? 'main.exe' : 'main');
                    writeFileSync(src, code);
                    const compile = await execLocal('g++', [src, '-o', out, '-std=c++17']);
                    if (compile.exitCode !== 0 || compile.stderr) {
                        result = { stdout: '', stderr: compile.stderr || compile.stdout, exitCode: 1 };
                    } else {
                        result = await execLocal(out, []);
                    }
                    cleanup();
                } else {
                    cleanup();
                    result = await runViaJDoodle('cpp', code);
                }
                break;
            }

            // ── C — try local gcc, fallback to JDoodle ──────────────────────
            case 'c': {
                const hasGcc = await commandExists('gcc');
                if (hasGcc) {
                    const src = join(dir, 'main.c');
                    const out = join(dir, process.platform === 'win32' ? 'main.exe' : 'main');
                    writeFileSync(src, code);
                    const compile = await execLocal('gcc', [src, '-o', out]);
                    if (compile.exitCode !== 0 || compile.stderr) {
                        result = { stdout: '', stderr: compile.stderr || compile.stdout, exitCode: 1 };
                    } else {
                        result = await execLocal(out, []);
                    }
                    cleanup();
                } else {
                    cleanup();
                    result = await runViaJDoodle('c', code);
                }
                break;
            }

            // ── Go — try local go, fallback to JDoodle ──────────────────────
            case 'go': {
                const hasGo = await commandExists('go');
                if (hasGo) {
                    const file = join(dir, 'main.go');
                    writeFileSync(file, code);
                    result = await execLocal('go', ['run', file]);
                    cleanup();
                } else {
                    cleanup();
                    result = await runViaJDoodle('go', code);
                }
                break;
            }

            // ── Rust — try local rustc, fallback to JDoodle ─────────────────
            case 'rust': {
                const hasRust = await commandExists('rustc');
                if (hasRust) {
                    const src = join(dir, 'main.rs');
                    const out = join(dir, process.platform === 'win32' ? 'main.exe' : 'main');
                    writeFileSync(src, code);
                    const compile = await execLocal('rustc', [src, '-o', out]);
                    if (compile.exitCode !== 0 || compile.stderr) {
                        result = { stdout: '', stderr: compile.stderr || compile.stdout, exitCode: 1 };
                    } else {
                        result = await execLocal(out, []);
                    }
                    cleanup();
                } else {
                    cleanup();
                    result = await runViaJDoodle('rust', code);
                }
                break;
            }

            default:
                cleanup();
                return res.status(400).json({ error: `Unsupported language: ${language}` });
        }

        return res.json(result);

    } catch (err: any) {
        cleanup();
        return res.status(500).json({ error: err.message });
    }
});

export default router;
