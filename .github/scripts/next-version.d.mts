export declare const SKIP_LABEL: string
export declare const MINOR_LABEL: string
export declare const MAJOR_LABEL: string

export declare function parseVersion(text: string): [number, number, number] | null
export declare function compareVersions(a: readonly number[], b: readonly number[]): number
export declare function nextVersion(input: { tags: string[]; packageVersion: string; labels?: string[] }): string | null
