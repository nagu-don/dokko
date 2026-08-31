/** Raw mongoose doc returned by GET /api/users/me (fields are snake-ish `_id`). */
export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role?: string;
  createdAt?: string;
}