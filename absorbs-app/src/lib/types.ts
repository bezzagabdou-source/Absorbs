export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  website: string | null;
  is_verified?: boolean;
  invite_code?: string | null;
  invited_by?: string | null;
  points?: number;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  content: string | null;
  image_url: string | null;
  media_type?: "image" | "video";
  group_id?: string | null;
  created_at: string;
  // joined / computed on the client
  author?: Profile;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  saved_by_me?: boolean;
}

export interface Story {
  id: string;
  author_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
  author?: Profile;
  viewed_by_me?: boolean;
  view_count?: number;
}

export interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Profile;
}

export interface DmThread {
  id: string;
  user_low: string;
  user_high: string;
  created_at: string;
  last_message_at: string | null;
  // computed on the client
  other_user?: Profile;
  last_message?: Message | null;
  unread_count: number;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

/** Raw row shapes returned by Supabase selects (before client-side joins). */
export interface PostRow {
  id: string;
  author_id: string;
  content: string | null;
  image_url: string | null;
  media_type?: "image" | "video";
  group_id?: string | null;
  created_at: string;
  author: Profile | null;
  likes: { count: number }[];
  comments: { count: number }[];
}


export interface Group {
  id: string;
  name: string;
  emoji: string;
  wilaya: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  member_count?: number;
  joined?: boolean;
}

export interface Challenge {
  id: string;
  title: string;
  hashtag: string;
  description: string | null;
  prize: string | null;
  ends_at: string;
  created_at: string;
}
