/**
 * The procedures of @procedures/weather as data. Importing this file registers nothing.
 */

import { defineModule, definePackage, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import { createWeatherProcedures, weatherProcedures, type WeatherProceduresOptions } from "./procedures.js";

const weatherPackage: PackageDefinition = definePackage("@procedures/weather", weatherProcedures);

export const weatherModule: ProcedureModule = weatherPackage.module;

export default weatherModule;

/**
 * This function gives the module with the settings of the host: the `fetch` of the requests.
 * Without options, it gives `weatherModule`.
 */
export function createWeatherModule(options: WeatherProceduresOptions = {}): ProcedureModule {
  if (options.fetch === undefined) return weatherModule;
  return defineModule("@procedures/weather", createWeatherProcedures(options));
}

/**
 * This function registers the procedures of @procedures/weather in a registry. The default is the
 * global registry.
 */
export const registerWeatherProcedures: PackageDefinition["register"] = weatherPackage.register;
