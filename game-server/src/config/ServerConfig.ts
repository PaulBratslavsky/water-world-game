/**
 * Server Configuration
 * Centralized configuration constants and environment variables
 */

import "dotenv/config";

export const SERVER_CONFIG = {
  port: parseInt(process.env.PORT || "3001", 10),
  tickRate: 20,
  get tickInterval() {
    return 1000 / this.tickRate;
  },
} as const;

export const STRAPI_CONFIG = {
  url: process.env.STRAPI_URL || "http://localhost:1337",
  apiToken: process.env.STRAPI_API_TOKEN || "",
  get saveEndpoint() {
    return `${this.url}/api/saves`;
  },
  saveInterval: 10000, // Auto-save every 10 seconds
} as const;

export const PHYSICS_CONFIG = {
  moveSpeed: 5,
  sprintMultiplier: 2.0,
  gravity: 20,
  jumpForce: 8,
  playerHeight: 2.0,
  maxStepHeight: 1.0,
  cellSize: 1,
} as const;

/**
 * Get authorization headers for Strapi API requests
 */
export function getStrapiHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (STRAPI_CONFIG.apiToken) {
    headers["Authorization"] = `Bearer ${STRAPI_CONFIG.apiToken}`;
  }
  return headers;
}
