export type CompletionUnit = {
    name: string;
    desc?: string;
    alias?: string;
};
export declare class Completion {
    completions: Record<string, any>;
    aliases: Record<string, string>;
    typedOpts: Record<string, Function | [Function]>;
    argValues: Record<string, any>;
    constructor(completions: Record<string, any>, aliases: Record<string, string>, typedOpts: Record<string, Function | [Function]>);
    static Count(num?: number): number;
    private _getCompletions;
    private _stringifyCompletions;
    private _argProcessor;
    nextCompletions(shell: string, otherCompletions: CompletionUnit[]): {};
}
export declare function getShell(shell?: string): string;
export declare function generateShellCompletion(name: string, completer?: string, shell?: string): Promise<string>;
