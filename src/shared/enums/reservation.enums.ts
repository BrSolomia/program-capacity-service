/** Whether a reservation still holds program capacity. */
export enum ReservationStatus {
  Active = 'ACTIVE',
  Released = 'RELEASED',
}

/** Party that acted on a reservation: a client of our API or treasury */
export enum ReservationActor {
  Client = 'CLIENT',
  Treasury = 'TREASURY',
}
