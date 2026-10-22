import { HouseOption } from '../types';

/**
 * A house is told apart by its id (what the API links things to) and shown by its label ("Casa 07", "Apto 302").
 * The id and the number only coincide in the first condominium, so a screen must never print an id as a number.
 */
export function houseLabelOf(houses: HouseOption[], houseId: number): string {
  return houses.find((house) => house.houseId === houseId)?.label ?? 'Casa';
}

/** The number typed by a person ("7", "07") against the houses of the condominium. */
export function houseByNumber(houses: HouseOption[], typed: string): HouseOption | undefined {
  const digits = typed.replace(/\D/g, '');
  if (!digits) {
    return undefined;
  }
  return houses.find((house) => house.number === Number(digits));
}
