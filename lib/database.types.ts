export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      applications: {
        Row: {
          accepted_at: string | null;
          applicant_id: string;
          cancelled_by: string | null;
          created_at: string;
          id: string;
          opportunity_id: string;
          resolved_at: string | null;
          responded_at: string | null;
          status: string;
          worker_ack_at: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          applicant_id: string;
          cancelled_by?: string | null;
          created_at?: string;
          id?: string;
          opportunity_id: string;
          resolved_at?: string | null;
          responded_at?: string | null;
          status?: string;
          worker_ack_at?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          applicant_id?: string;
          cancelled_by?: string | null;
          created_at?: string;
          id?: string;
          opportunity_id?: string;
          resolved_at?: string | null;
          responded_at?: string | null;
          status?: string;
          worker_ack_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: "applications_applicant_id_fkey"; columns: ["applicant_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "applications_opportunity_id_fkey"; columns: ["opportunity_id"]; isOneToOne: false; referencedRelation: "opportunities"; referencedColumns: ["id"] },
        ];
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
        Relationships: [
          { foreignKeyName: "event_attendance_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
          { foreignKeyName: "event_attendance_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
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
        Relationships: [
          { foreignKeyName: "events_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "events_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
        ];
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
        Relationships: [
          { foreignKeyName: "flow_ledger_opportunity_id_fkey"; columns: ["opportunity_id"]; isOneToOne: false; referencedRelation: "opportunities"; referencedColumns: ["id"] },
          { foreignKeyName: "flow_ledger_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          href: string | null;
          id: string;
          profile_id: string;
          read: boolean;
          title: string;
          type: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          href?: string | null;
          id?: string;
          profile_id: string;
          read?: boolean;
          title: string;
          type: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          href?: string | null;
          id?: string;
          profile_id?: string;
          read?: boolean;
          title?: string;
          type?: string;
        };
        Relationships: [
          { foreignKeyName: "notifications_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      opportunities: {
        Row: {
          category: string | null;
          city: string;
          created_at: string;
          created_by: string;
          description: string | null;
          ends_at: string | null;
          id: string;
          instant_book: boolean;
          is_remote: boolean;
          lat: number | null;
          lng: number | null;
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
          category?: string | null;
          city?: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          instant_book?: boolean;
          is_remote?: boolean;
          lat?: number | null;
          lng?: number | null;
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
          category?: string | null;
          city?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          instant_book?: boolean;
          is_remote?: boolean;
          lat?: number | null;
          lng?: number | null;
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
        Relationships: [
          { foreignKeyName: "opportunities_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "opportunities_organization_id_fkey"; columns: ["organization_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
        ];
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
        Relationships: [
          { foreignKeyName: "organizations_owner_id_fkey"; columns: ["owner_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
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
        Relationships: [
          { foreignKeyName: "profile_skills_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "profile_skills_skill_id_fkey"; columns: ["skill_id"]; isOneToOne: false; referencedRelation: "skills"; referencedColumns: ["id"] },
        ];
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
          rating: number | null;
          recipient_id: string;
          skills_demonstrated: string[] | null;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          opportunity_id?: string | null;
          rating?: number | null;
          recipient_id: string;
          skills_demonstrated?: string[] | null;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          opportunity_id?: string | null;
          rating?: number | null;
          recipient_id?: string;
          skills_demonstrated?: string[] | null;
        };
        Relationships: [
          { foreignKeyName: "recommendations_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "recommendations_opportunity_id_fkey"; columns: ["opportunity_id"]; isOneToOne: false; referencedRelation: "opportunities"; referencedColumns: ["id"] },
          { foreignKeyName: "recommendations_recipient_id_fkey"; columns: ["recipient_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
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
        Relationships: [
          { foreignKeyName: "verifications_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
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
      reliability_breakdown: {
        Row: {
          currently_accepted: number | null;
          gigs_completed: number | null;
          no_shows: number | null;
          profile_id: string | null;
          reliability_score: number | null;
          withdrawn_before_start: number | null;
          worker_cancellations: number | null;
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

export type Tables<T extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])> = (DefaultSchema["Tables"] &
  DefaultSchema["Views"])[T]["Row"];
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"];
export type PassportSummary = DefaultSchema["Views"]["passport_summary"]["Row"];
export type ReliabilityBreakdown = DefaultSchema["Views"]["reliability_breakdown"]["Row"];

export type ApplicationStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "completed" | "no_show" | "cancelled";
export type NotificationType =
  | "application_submitted"
  | "application_accepted"
  | "application_rejected"
  | "opportunity_changed"
  | "opportunity_cancelled"
  | "gig_reminder"
  | "completion_confirmed"
  | "recommendation_received";
