/** Shapes returned by the Postgres schema in supabase/migrations. */

export type RollStatus = 'active' | 'finished';
export type MemberRole = 'owner' | 'member';
export type ReportReason = 'nudity' | 'violence' | 'harassment' | 'other';

/** The three real film-roll lengths (PRD §7.3). */
export const EXPOSURE_OPTIONS = [12, 24, 36] as const;

/**
 * Concurrent active rolls per user (PRD §9.5).
 *
 * The server is the authority — `max_active_rolls()` in the migrations refuses
 * beyond this on both the create and join paths. This copy exists so the app
 * can name the number in a message and draw the right number of slots on the
 * camera's base. Change both together.
 */
export const MAX_ACTIVE_ROLLS = 3;
export type Exposures = (typeof EXPOSURE_OPTIONS)[number];

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
  /** Rolls opened, ever. Never decremented — see the free-rolls migration. */
  rolls_created: number;
}

export interface Roll {
  id: string;
  name: string;
  owner_id: string;
  max_frames: number;
  filter: string;
  share_code: string;
  status: RollStatus;
  photo_count: number;
  developed_early: boolean;
  created_at: string;
  finished_at: string | null;
}

export interface RollMember {
  roll_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profile?: Profile;
}

export interface Photo {
  id: string;
  roll_id: string;
  /** Null once that account is deleted; the frame stays on the roll. */
  user_id: string | null;
  storage_path: string;
  frame_number: number;
  width: number | null;
  height: number | null;
  taken_at: string;
  hidden_at: string | null;
  hidden_by: string | null;
}

/** A roll plus the bits every list screen needs. */
export interface RollWithMembers extends Roll {
  members: RollMember[];
}
