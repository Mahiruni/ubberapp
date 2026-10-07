"use client";
import { useContext, useEffect, useState } from "react";
import { places, type Place } from "../../lib/nexride-places";
import { type PreviewTrip } from "../../lib/nexride-preview";
import {
  Button,
  Icon,
  ListRow,
  Sheet,
  useTranslation,
  LanguageContext,
} from "./ui";
import { TripExperience } from "./trip-experience";
import { useRiderTrips } from "../../lib/nexride-use-trips";
import { tripStatus } from "../../lib/nexride-trip-data";
import { RiderHomePanel } from "./rider-home";
import {
  emptyHomePlaces,
  HOME_PLACES_KEY,
  restoreHomePlaces,
  serializeHomePlaces,
  type HomePlaces,
} from "../../lib/nexride-home";
import { DestinationPanel, endpointName } from "./destination";
import { RideSelection } from "./ride-selection";
import { DriverMatching } from "./matching";
import type { Matching } from "../../lib/nexride-use-matching";
import type { RideCategory, RideFare } from "../../lib/nexride-booking";
import { placeKey } from "../../lib/nexride-search";
import type { Journey } from "../../lib/nexride-journey";
import type { RiderLocation, LocationStatus } from "../../lib/nexride-location";
export type RiderScreen =
  | "home"
  | "saved"
  | "destination"
  | "rides"
  | "finding"
  | "trip"
  | "live"
  | "summary"
  | "wallet"
  | "trips"
  | "profile";
export function RiderWorkspace({
  screen,
  navigate,
  onSafety,
  onUnavailable,
  trip,
  setTrip,
  position,
  locationStatus,
  locate,
  journey,
  onBookingPending,
  matching,
 ¶»§q«^