// MOVVI notification event catalog. Names are stable strings used for
// preference gating, logs, and analytics — do not repurpose an existing key.

export const PASSENGER_EVENTS = {
  DRIVER_ACCEPTED: "passenger.driver_accepted",
  DRIVER_ARRIVING: "passenger.driver_arriving",
  DRIVER_ARRIVED: "passenger.driver_arrived",
  RIDE_STARTED: "passenger.ride_started",
  RIDE_FINISHED: "passenger.ride_finished",
  RIDE_CANCELLED: "passenger.ride_cancelled",
  SECURITY_CODE_REMINDER: "passenger.security_code_reminder",
} as const;

export const DRIVER_EVENTS = {
  NEW_RIDE_REQUEST: "driver.new_ride_request",
  RIDE_CANCELLED_BY_PASSENGER: "driver.ride_cancelled_by_passenger",
  PASSENGER_WAITING: "driver.passenger_waiting",
  SUBSCRIPTION_EXPIRING: "driver.subscription_expiring",
  SUBSCRIPTION_PAID: "driver.subscription_paid",
  SUBSCRIPTION_BLOCKED: "driver.subscription_blocked",
} as const;

export type PassengerEvent = (typeof PASSENGER_EVENTS)[keyof typeof PASSENGER_EVENTS];
export type DriverEvent = (typeof DRIVER_EVENTS)[keyof typeof DRIVER_EVENTS];
export type NotificationEvent = PassengerEvent | DriverEvent;

/** Map an event to a preference category so users can silence classes of notifications. */
export type PreferenceCategory =
  | "ride_updates"
  | "ride_requests"
  | "payment_reminders"
  | "promotions";

export function categoryForEvent(event: NotificationEvent): PreferenceCategory {
  if (event === DRIVER_EVENTS.NEW_RIDE_REQUEST) return "ride_requests";
  if (
    event === DRIVER_EVENTS.SUBSCRIPTION_EXPIRING ||
    event === DRIVER_EVENTS.SUBSCRIPTION_PAID ||
    event === DRIVER_EVENTS.SUBSCRIPTION_BLOCKED
  )
    return "payment_reminders";
  return "ride_updates";
}
