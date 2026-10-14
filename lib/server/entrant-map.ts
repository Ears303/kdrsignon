// Maps YOUR entrants table columns to what the scrutineering page shows.
export const ENTRANT_COLUMNS =
  "id,event_id,entrant_type,competition_number,primary_name,class_name,vehicle_description,registration_number";

export type PublicEntrant = {
  id: string;
  eventId: string;
  riderName: string;
  competitionNumber: string;
  className: string | null;
  vehicleDescription: string | null;
  registrationNumber: string | null;
};

export function mapEntrant(row: any): PublicEntrant {
  return {
    id: row.id,
    eventId: row.event_id,
    riderName: row.primary_name,
    competitionNumber: String(row.competition_number),
    className: row.class_name ?? null,
    vehicleDescription: row.vehicle_description ?? null,
    registrationNumber: row.registration_number ?? null,
  };
}
