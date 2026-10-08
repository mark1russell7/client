/**
 * Template Generator
 *
 * Simple template-based file generation for JSON and other formats.
 */
import type { GeneratorContext, GeneratorFn } from "../schema/types.js";
/**
 * Create a template-based generator function.
 *
 * @param templateName - The template name to use
 */
export declare function templateGenerator(templateName: string): GeneratorFn;
/**
 * Register a custom template
 */
export declare function registerTemplate(name: string, generator: (context: GeneratorContext) => string): void;
//# sourceMappingURL=template.d.ts.map