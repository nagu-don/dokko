/** Raw mongoose doc returned by GET /api/users/me (fields are snake-ish `_id`). */
export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  phone: string;
  /** true when `phone` is a Google sign-in placeholder, not a real number yet */
  phoneIsPlaceholder?: boolean;
  role?: string;
  createdAt?: string;
}