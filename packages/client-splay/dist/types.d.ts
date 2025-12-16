/**
 * Bridge Types
 *
 * Types for bridging splay's rendering model with client's procedure system.
 */
import type { ComponentOutput, Size } from "@mark1russell7/client";
/**
 * Render context passed to component renderers.
 * Compatible with splay's RenderContext interface.
 */
export interface RenderContext<TData = unknown> {
    /** Data to render */
    data: TData;
    /** Available size for rendering */
    size: Size;
    /** Path in the render tree */
    path: string;
    /** Depth in the render tree */
    depth: number;
    /** Render a child component */
    render: (data: unknown, size: Size, path: string) => ComponentOutput | Promise<ComponentOutput>;
}
/**
 * Component renderer function.
 */
export type ComponentRenderer<TOutput = ComponentOutput> = (ctx: RenderContext) => TOutput | Promise<TOutput>;
/**
 * Streaming component renderer function.
 */
export type StreamingComponentRenderer<TOutput = ComponentOutput> = (ctx: RenderContext) => AsyncIterable<TOutput>;
/**
 * Registry interface compatible with splay.
 */
export interface Registry<TOutput = ComponentOutput> {
    /** Get a renderer for a component type */
    get(type: string): ComponentRenderer<TOutput> | undefined;
    /** Check if a renderer exists */
    has(type: string): boolean;
    /** Register a renderer (throws - use client procedures instead) */
    register(type: string, renderer: ComponentRenderer<TOutput>): void;
}
/**
 * Streaming registry interface.
 */
export interface StreamingRegistry<TOutput = ComponentOutput> {
    /** Get a streaming renderer for a component type */
    get(type: string): StreamingComponentRenderer<TOutput> | undefined;
    /** Check if a renderer exists */
    has(type: string): boolean;
}
/**
 * Options for creating a client registry.
 */
export interface ClientRegistryOptions {
    /** Namespace prefix for component lookups (e.g., "ui" → "components.ui.{type}") */
    namespace?: string;
    /** Default size for components without explicit size */
    defaultSize?: Size;
}
/**
 * Options for creating a streaming registry.
 */
export interface StreamingRegistryOptions extends ClientRegistryOptions {
    /** Buffer size for streaming backpressure */
    bufferSize?: number;
}
/**
 * Component map for hydration.
 * Maps component type names to framework-specific components.
 */
export type ComponentMap<TComponent = unknown> = Record<string, TComponent>;
/**
 * Hydration options.
 */
export interface HydrateOptions<TComponent = unknown> {
    /** Map of component types to framework components */
    components: ComponentMap<TComponent>;
    /** Fallback component for unknown types */
    fallback?: TComponent;
    /** Handler for null outputs */
    onNull?: () => TComponent | null;
    /** Handler for fragments */
    onFragment?: (children: TComponent[]) => TComponent;
}
//# sourceMappingURL=types.d.ts.map