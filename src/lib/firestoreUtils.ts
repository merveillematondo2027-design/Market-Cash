/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Nettoie récursivement un objet pour éliminer toutes les valeurs `undefined`
 * afin d'éviter les erreurs Firestore : "Unsupported field value: undefined".
 */
export function removeUndefined<T extends Record<string, any>>(data: T): Partial<T> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = removeUndefined(value);
    } else {
      result[key] = value;
    }
  }

  return result as Partial<T>;
}

export const cleanFirestoreData = removeUndefined;
