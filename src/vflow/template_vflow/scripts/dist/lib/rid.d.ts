export declare function parseRidDefinitions(text: string): Set<string>;
export declare function parseRidReferences(text: string): Set<string>;
export declare function checkRidCoverage(required: Set<string>, covered: Set<string>, docName: string): [boolean, string[]];
export declare function verifySection(text: string, sectionNo: number): string;
