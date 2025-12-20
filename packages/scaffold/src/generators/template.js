/**
 * Template Generator
 *
 * Simple template-based file generation for JSON and other formats.
 */
import { Feature } from "../schema/types.js";
/**
 * Template definitions
 */
const templates = {
    "dependencies.json.ejs": (context) => {
        // Convert features to the format expected by cue-config
        const features = [...context.features]
            .filter((f) => f !== Feature.Core)
            .map((f) => f.toLowerCase());
        return JSON.stringify({ features }, null, 2) + "\n";
    },
};
/**
 * Create a template-based generator function.
 *
 * @param templateName - The template name to use
 */
export function templateGenerator(templateName) {
    return async (_path, context) => {
        const template = templates[templateName];
        if (!template) {
            throw new Error(`Unknown template: ${templateName}`);
        }
        return template(context);
    };
}
/**
 * Register a custom template
 */
export function registerTemplate(name, generator) {
    templates[name] = generator;
}
//# sourceMappingURL=template.js.map