export type CompletionUnit = {
  name: string;
  desc?: string;
  alias?: string;
};

export enum ArgType {
  Boolean,
  String,
  Number,
  Count,
}

export class Completion {
  constructor(
    public completions: Record<string, any>,
    public aliases: Record<string, string>,
    public typedOpts: Record<string, ArgType>,
  ) {
    Object.entries(aliases).forEach(([k, v]) => {
      typedOpts[k] = typedOpts[v] ?? ArgType.Boolean;
    });
  }

  private _getCompletions(args: string[]): string | CompletionUnit[] {
    let parentObj = this.completions;
    for (const arg in args) {
      if (!(arg in parentObj)) return [];
      parentObj = parentObj[arg];
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

  nextCompletions(shell: string, otherCompletions: CompletionUnit[]) {
    const line = process.env.COMP_LINE;
    if (!line) {
      return { completions: {}, argVals: {} };
    }
    const parts = line.split(" ").slice(1);
    const partial = parts.at(-1) ?? "";

    let knownParts: string[] = [];
    let argVals: Record<string, any> = {};

    for (const part in parts.slice(0, -1)) {
      if (part in this.typedOpts) {
        knownParts.push(part);
        if (this.typedOpts[part] === ArgType.Count) {
          argVals[part] = (argVals[part] || 0) + 1;
        }
      } else if (knownParts.length !== 0 && part[0] !== "-") {
        const lastProcessed = knownParts.at(-1)!;
        const typeLastProcessed = this.typedOpts[lastProcessed];
        switch (typeLastProcessed) {
          case ArgType.Boolean:
            break;
          case ArgType.Number:
            let num = Number(part);
            if (Number.isNaN(num)) num = 0;
            argVals[lastProcessed] = num;
            break;
          case ArgType.String:
            argVals[lastProcessed] = part;
            break;
        }
      } else if (
        knownParts.length !== 0 &&
        part[0] === "-" &&
        part.slice(0, 1) in this.typedOpts &&
        this.typedOpts[part.slice(0, 1)] == ArgType.Count
      ) {
        argVals[part[1]] = (argVals[part[1]] || 0) + part.length - 1;
      }
    }

    const definedCompletions = this._getCompletions(knownParts);
    if (typeof definedCompletions === "string") {
      return { completions: definedCompletions, argvals: argVals };
    }
    let lines = this._stringifyCompletions(
      shell,
      definedCompletions.concat(otherCompletions),
    );
    if (shell === "bash") {
      lines = lines.filter((arg) => arg.startsWith(partial));
    }
    return { completions: lines, argvals: argVals };
  }
}
