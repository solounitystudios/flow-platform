export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      applications: {
        Row: {
          applicant_id: string;
          created_at: string;
          id: string;
          opportunity_id: string;
          status: string;
        };
        Insert: {
          applicant_id: string;
          created_at?: string;
          id?: string;
          opportunity_id: string;
          status?: string;
        };
        Update: {
          applicant_id?: string;
          created_at?: string;
          id?: string;
          opportunity_id?: string;
          status?: string;
        };
        Relationships: [];
      };
      event_attendance: {
        Row: {
          checked_in_at: string | null;
          event_id: string;
          profile_id: string;
          status: string;
        };
        Insert: {
          checked_in_at?: string | null;
          event_id: string;
          profile_id: string;
          status?: string;
        };
        Update: {
          checked_in_at?: string | null;
          event_id?: string;
          profile_id?: string;
          status?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          capacity: number | null;
          city: string;
          created_at: string;
          created_by: string;
          description: string | null;
          ends_at: string | null;
          id: string;
          organization_id: string | null;
          starts_at: string;
          state: string;
          status: string;
          title: string;
          venue: string | null;
        };
        Insert: {
          capacity?: number | null;
          city?: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          organization_id?: string | null;
          starts_at: string;
          state?: string;
          status?: string;
          title: string;
          venue?: string | null;
        };
        Update: {
          capacity?: number | null;
          city?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          organization_id?: string | null;
          starts_at?: string;
          state?: string;
          status?: string;
          title?: string;
          venue?: string | null;
        };
        Relationships: [];
      };
      flow_ledger: {
        Row: {
          amount_cents: number;
          created_at: string;
          description: string | null;
          entry_type: string;
          id: string;
          opportunity_id: string | null;
          points: number;
          profile_id: string;
        };
        Insert: {
          amount_cents?: number;
          created_at?: string;
          description?: string | null;
          entry_type: string;
          id?: string;
          opportunity_id?: string | null;
          points?: number;
          profile_id: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          description?: string | null;
          entry_type?: string;
          id?: string;
          opportunity_id?: string | null;
          points?: number;
          profile_id?: string;
        };
        Relationships: [];
      };
      opportunities: {
        Row: {
          city: string;
          created_at: string;
          created_by: string;
          description: string | null;
          ends_at: string | null;
          id: string;
          location_name: string | null;
          opportunity_type: string;
          organization_id: string | null;
          pay_cents: number | null;
          slots: number;
          starts_at: string | null;
          state: string;
          status: string;
          title: string;
        };
        Insert: {
          city?: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          location_name?: string | null;
          opportunity_type: string;
          organization_id?: string | null;
          pay_cents?: number | null;
          slots?: number;
          starts_at?: string | null;
          state?: string;
          status?: string;
          title: string;
        };
        Update: {
          city?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          location_name?: string | null;
          opportunity_type?: string;
          organization_id?: string | null;
          pay_cents?: number | null;
          slots?: number;
          starts_at?: string | null;
          state?: string;
          status?: string;
          title?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          city: string | null;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          owner_id: string;
          state: string | null;
          verified: boolean;
        };
        Insert: {
          city?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          owner_id: string;
          state?: string | null;
          verified?: boolean;
        };
        Update: {
          city?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          state?: string | null;
          verified?: boolean;
        };
        Relationships: [];
      };
      profile_skills: {
        Row: {
          profile_id: string;
          skill_id: string;
          verified: boolean;
          verified_at: string | null;
        };
        Insert: {
          profile_id: string;
          skill_id: string;
          verified?: boolean;
          verified_at?: string | null;
        };
        Update: {
          profile_id?: string;
          skill_id?: string;
          verified?: boolean;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          available_now: boolean;
          avatar_url: string | null;
          bio: string | null;
          city: string;
          created_at: string;
          flow_points: number;
          full_name: string | null;
          id: string;
          public_passport: boolean;
          reliability_score: number;
          state: string;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          available_now?: boolean;
          avatar_url?: string | null;
          bio?: string | null;
          city?: string;
          created_at?: string;
          flow_points?: number;
          full_name?: string | null;
          id: string;
          public_passport?: boolean;
          reliability_score?: number;
          state?: string;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          available_now?: boolean;
          avatar_url?: string | null;
          bio?: string | null;
          city?: string;
          created_at?: string;
          flow_points?: number;
          full_name?: string | null;
          id?: string;
          public_passport?: boolean;
          reliability_score?: number;
          state?: string;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      recommendations: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          opportunity_id: string | null;
          recipient_id: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          opportunity_id?: string | null;
          recipient_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          opportunity_id?: string | null;
          recipient_id?: string;
        };
        Relationships: [];
      };
      skills: {
        Row: {
          category: string | null;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      verifications: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          reference_id: string | null;
          status: string;
          verification_type: string;
          verified_at: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_id: string;
          reference_id?: string | null;
          status?: string;
          verification_type: string;
          verified_at?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_id?: string;
          reference_id?: string | null;
          status?: string;
          verification_type?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      passport_summary: {
        Row: {
          available_now: boolean | null;
          city: string | null;
          earned_cents: number | null;
          events_attended: number | null;
          flow_points: number | null;
          full_name: string | null;
          gigs_completed: number | null;
          id: string | null;
          recommendations: number | null;
          reliability_score: number | null;
          skills_verified: number | null;
          state: string | null;
          username: string | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type DefaultSchema = Database["public"];

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"];
export type PassportSummary = DefaultSchema["Views"]["passport_summary"]["Row"];
