import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Standalone verification only. Nothing under src/ imports this loader or its checks.
export function createTsModuleLoader(globals = {}) {
  const cache = new Map();
  const context = vm.createContext({ console, ...globals });
  function load(sourcePath) {
    const resolved = path.resolve(projectRoot, sourcePath);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const module = { exports: {} };
    cache.set(resolved, module);
    const source = readFileSync(resolved, "utf8");
    if (resolved.endsWith(".json")) {
      module.exports = JSON.parse(source);
      return module.exports;
    }
    const compiled = ts.transpileModule(source, {
      fileName: resolved,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        resolveJsonModule: true
      }
    }).outputText;
    const localRequire = (request) => {
      if (!request.startsWith(".")) return require(request);
      const base = path.resolve(path.dirname(resolved), request);
      const candidate = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, path.join(base, "index.ts")]
        .find((file) => existsSync(file) && statSync(file).isFile());
      if (!candidate) throw new Error(`Cannot resolve ${request} from ${resolved}`);
      return load(candidate);
    };
    const execute = vm.runInContext(`(function(module, exports, require) {\n${compiled}\n})`, context, {
      filename: resolved
    });
    execute(module, module.exports, localRequire);
    return module.exports;
  }
  return load;
}

export const loadTsModule = createTsModuleLoader();
