import { readFile } from "fs/promises";
import * as path from "path";

class ShellValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShellValidationError";
  }
}

export type CompletionUnit = {
  name: string;
  desc?: string;
  alias?: string;
};

export class Completion {
  public argValues: Record<string, any>;
  constructor(
    public completions: Record<string, any>,
    public aliases: Record<string, string>,
    public typedOpts: Record<string, Function | [Function]>,
  ) {
    Object.entries(aliases).forEach(([k, v]) => {
      typedOpts[k] = typedOpts[v];
      completions[v] ??= {};
      completions[k] = completions[v];
    });
    this.argValues = new Map<string, any>();
  }

  public static Count(num?: number): number {
    return (num ?? 0) + 1;
  }

  private _getCompletions(
    args: string[],
    onlyOpts: boolean = false,
  ): string | CompletionUnit[] {
    let parentObj = this.completions;
    for (const arg in args) {
      if (!(arg in parentObj)) return [];
      parentObj = parentObj[arg];
    }
    if (onlyOpts) {
      const opts = parentObj["__opts"];
      if (!Array.isArray(opts)) {
        return [];
      }
      return opts.map((x) => ({ name: x }));
    }
    if (typeof parentObj === "string") {
      return parentObj;
    }
    if (Array.isArray(parentObj)) {
      return parentObj.map((x) => ({ name: x }));
    }
    let comple: CompletionUnit[] = [];
    for (const cmp in parentObj) {
      if (cmp !== "__desc" && cmp !== "__opts") {
        comple.push({
          name: cmp,
          desc: parentObj["__desc"] ?? "",
          alias: this.aliases[cmp] ?? "",
        });
      }
    }
    return comple;
  }

  private _stringifyCompletions(
    shell: string,
    comple: CompletionUnit[],
  ): string[] {
    return comple.map((item) => {
      const { name: rawName, desc: rawDesc, alias: rawAlias } = item;
      let sep = "\t";
      let line = rawName;
      if (shell === "zsh") {
        rawName.replaceAll(":", "\\:");
        rawDesc?.replaceAll(":", "\\:");
        rawAlias?.replaceAll(":", "\\:");
        sep = ":";
      }
      if (shell !== "bash") {
        if (rawDesc) {
          line += `${sep}${rawDesc}`;
        }
        // TODO: Aliases
      }
      return line;
    });
  }

  private _argProcessor(line: string) {
    const argSplit = line.split(/ -- /);
    // TODO: Another thing that can be done is not clearing everytime, and
    // compare with the previous line. To be implemented later.
    this.argValues.clear();
    this.argValues["--"] = argSplit[1]?.split(" ") || [];

    const argParts = argSplit[0].split(/[ =]+/).slice(1);
    if (this.argValues["--"].length > 0 || argParts?.at(-1)! in this.typedOpts)
      argParts.push("");
    const partial = argParts.pop() ?? "";
    const len = argParts.length;

    const pargs = new Set<string>();
    let compleOpt = false;

    for (let i = 0; i < len; ++i) {
      let parg = argParts[i];
      if (!parg.startsWith("-")) {
        if (parg in this.typedOpts) {
          this.argValues[parg] = true;
          pargs.add(parg);
        } else {
          this.argValues["--"].push(parg);
        }
        continue;
      }
      if (parg.startsWith("--") || parg.length === 2) {
        const fntype = this.typedOpts[parg];
        if ((!fntype && !pargs.has(parg)) || fntype === Boolean) {
          this.argValues[parg] = true;
          this.typedOpts[parg] = Boolean;
        } else if (fntype === String || fntype === Number) {
          if (i === len - 1) {
            compleOpt = true;
            break;
          }
          this.argValues[parg] = fntype(argParts[++i]);
        } else if (!fntype || fntype === Completion.Count) {
          this.argValues[parg] = Completion.Count(this.argValues[parg]);
          this.typedOpts[parg] = Completion.Count;
        } else if (Array.isArray(fntype)) {
          const nfntype = fntype[0];
          this.argValues[parg] ??= [];
          if (i === len - 1) {
            compleOpt = true;
            break;
          }
          const collect = argParts[i + 1].split(",");
          if (nfntype === Number && collect.length <= 1) {
            while (i < len - 2 && !Number.isNaN(Number(argParts[i + 1]))) {
              this.argValues[parg].push(argParts[++i]);
            }
          } else {
            this.argValues[parg].concat(collect.map((item) => nfntype(item)));
          }
        }
        pargs.add(parg);
        continue;
      }
      const p0 = parg.slice(0, 2);
      if (
        this.typedOpts[p0] === Number ||
        !Number.isNaN(Number(parg.slice(2)))
      ) {
        this.argValues[p0] = Number(parg.slice(2));
        continue;
      }
      const splChar = [...parg.slice(1)].reduce(
        (res, char) => (
          res.set(`-${char}`, (res.get(`-${char}`) ?? 0) + 1), res
        ),
        new Map<string, number>(),
      );
      splChar.forEach((v, k) => {
        if (this.typedOpts[k] === Boolean) {
          this.argValues[k] = true;
        } else {
          this.argValues[k] = (this.argValues[k] ?? 0) + v;
        }
      });
    }
    return {
      processedArgs: Array.from(pargs),
      partArg: partial,
      completeOpt: compleOpt,
    };
  }

  public nextCompletions(shell: string, otherCompletions: CompletionUnit[]) {
    const line = process.env.COMP_LINE;
    if (!line) {
      return {};
    }

    const {
      processedArgs: knownParts,
      partArg: partial,
      completeOpt,
    } = this._argProcessor(line);

    const definedCompletions = this._getCompletions(knownParts, completeOpt);
    if (typeof definedCompletions === "string") {
      return definedCompletions;
    }
    let lines = this._stringifyCompletions(
      shell,
      definedCompletions.concat(otherCompletions),
    );
    if (shell === "bash") {
      lines = lines.filter((arg) => arg.startsWith(partial));
    }
    return lines;
  }
}

const SUPPORTED_SHELLS: string[] = ["bash", "zsh", "fish"];

const SHELL_TO_EXT: Record<string, string> = {
  bash: "bash",
  zsh: "zsh",
  fish: "fish",
};

export function getShell(shell?: string): string {
  shell = shell?.trim();
  shell = shell || process.env.SHELL;

  if (!shell) {
    throw new ShellValidationError(
      "Cannot detect SHELL; provide shell manually or set SHELL environment variable",
    );
  }

  shell = shell.split(/[\/\\]+/).pop();

  if (!SUPPORTED_SHELLS.includes(shell!)) {
    throw new ShellValidationError(
      `Unrecognized SHELL ${shell}. Only '${SUPPORTED_SHELLS.join("', '")}' are supported`,
    );
  }

  return shell!;
}

export async function generateShellCompletion(
  name: string,
  completer?: string,
  shell?: string,
): Promise<string> {
  shell = getShell(shell);
  completer = completer || "completion";

  const templateScript = path.join(
    __dirname,
    "templates",
    `completion.${SHELL_TO_EXT[shell]}`,
  );
  const templateContent = await readFile(templateScript, "utf8");

  return templateContent
    .replaceAll("{pkgname}", name)
    .replaceAll("{completer}", completer)
    .replaceAll(/\r?\n/g, "\n");
}
