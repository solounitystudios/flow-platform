export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      achievements: {
        Row: { description: string; icon: string; key: string; points_bonus: number; title: string };
        Insert: { description: string; icon: string; key: string; points_bonus?: number; title: string };
        Update: { description?: string; icon?: string; key?: string; points_bonus?: number; title?: string };
        Relationships: [];
      };
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
      admins: {
        Row: { created_at: string; profile_id: string };
        Insert: { created_at?: string; profile_id: string };
        Update: { created_at?: string; profile_id?: string };
        Relationships: [
          { foreignKeyName: "admins_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: true; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      connections: {
        Row: {
          blocked_by: string | null;
          created_at: string;
          id: string;
          recipient_id: string;
          requester_id: string;
          responded_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          blocked_by?: string | null;
          created_at?: string;
          id?: string;
          recipient_id: string;
          requester_id: string;
          responded_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          blocked_by?: string | null;
          created_at?: string;
          id?: string;
          recipient_id?: string;
          requester_id?: string;
          responded_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "connections_blocked_by_fkey"; columns: ["blocked_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "connections_recipient_id_fkey"; columns: ["recipient_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "connections_requester_id_fkey"; columns: ["requester_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      connection_events: {
        Row: { action: string; actor_id: string; created_at: string; id: string; recipient_id: string; requester_id: string };
        Insert: { action: string; actor_id: string; created_at?: string; id?: string; recipient_id: string; requester_id: string };
        Update: { action?: string; actor_id?: string; created_at?: string; id?: string; recipient_id?: string; requester_id?: string };
        Relationships: [
          { foreignKeyName: "connection_events_actor_id_fkey"; columns: ["actor_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "connection_events_recipient_id_fkey"; columns: ["recipient_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "connection_events_requester_id_fkey"; columns: ["requester_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      connection_reports: {
        Row: { created_at: string; details: string | null; id: string; reason: string; reported_id: string; reporter_id: string; status: string };
        Insert: { created_at?: string; details?: string | null; id?: string; reason: string; reported_id: string; reporter_id: string; status?: string };
        Update: { created_at?: string; details?: string | null; id?: string; reason?: string; reported_id?: string; reporter_id?: string; status?: string };
        Relationships: [
          { foreignKeyName: "connection_reports_reported_id_fkey"; columns: ["reported_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "connection_reports_reporter_id_fkey"; columns: ["reporter_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      conversations: {
        Row: {
          applicant_id: string | null;
          created_at: string;
          created_by: string;
          event_id: string | null;
          id: string;
          last_message_at: string;
          opportunity_id: string | null;
          type: string;
        };
        Insert: {
          applicant_id?: string | null;
          created_at?: string;
          created_by: string;
          event_id?: string | null;
          id?: string;
          last_message_at?: string;
          opportunity_id?: string | null;
          type: string;
        };
        Update: {
          applicant_id?: string | null;
          created_at?: string;
          created_by?: string;
          event_id?: string | null;
          id?: string;
          last_message_at?: string;
          opportunity_id?: string | null;
          type?: string;
        };
        Relationships: [
          { foreignKeyName: "conversations_applicant_id_fkey"; columns: ["applicant_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "conversations_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "conversations_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
          { foreignKeyName: "conversations_opportunity_id_fkey"; columns: ["opportunity_id"]; isOneToOne: false; referencedRelation: "opportunities"; referencedColumns: ["id"] },
        ];
      };
      conversation_members: {
        Row: { conversation_id: string; joined_at: string; last_read_at: string; profile_id: string };
        Insert: { conversation_id: string; joined_at?: string; last_read_at?: string; profile_id: string };
        Update: { conversation_id?: string; joined_at?: string; last_read_at?: string; profile_id?: string };
        Relationships: [
          { foreignKeyName: "conversation_members_conversation_id_fkey"; columns: ["conversation_id"]; isOneToOne: false; referencedRelation: "conversations"; referencedColumns: ["id"] },
          { foreignKeyName: "conversation_members_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      event_attendance: {
        Row: {
          cancelled_at: string | null;
          check_in_method: string | null;
          checked_in_at: string | null;
          checked_in_by: string | null;
          checkin_code: string;
          event_id: string;
          id: string;
          price_cents: number;
          profile_id: string;
          reserved_at: string;
          status: string;
          ticket_type: string;
        };
        Insert: {
          cancelled_at?: string | null;
          check_in_method?: string | null;
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          checkin_code: string;
          event_id: string;
          id?: string;
          price_cents?: number;
          profile_id: string;
          reserved_at?: string;
          status?: string;
          ticket_type?: string;
        };
        Update: {
          cancelled_at?: string | null;
          check_in_method?: string | null;
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          checkin_code?: string;
          event_id?: string;
          id?: string;
          price_cents?: number;
          profile_id?: string;
          reserved_at?: string;
          status?: string;
          ticket_type?: string;
        };
        Relationships: [
          { foreignKeyName: "event_attendance_checked_in_by_fkey"; columns: ["checked_in_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "event_attendance_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
          { foreignKeyName: "event_attendance_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      events: {
        Row: {
          address: string | null;
          age_restriction: string | null;
          capacity: number | null;
          category: string | null;
          city: string;
          created_at: string;
          created_by: string;
          description: string | null;
          ends_at: string | null;
          featured: boolean;
          id: string;
          image_url: string | null;
          is_paid: boolean;
          is_public: boolean;
          lat: number | null;
          lng: number | null;
          organization_id: string | null;
          starts_at: string;
          state: string;
          status: string;
          tags: string[] | null;
          ticket_price_cents: number | null;
          title: string;
          venue: string | null;
        };
        Insert: {
          address?: string | null;
          age_restriction?: string | null;
          capacity?: number | null;
          category?: string | null;
          city?: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          ends_at?: string | null;
          featured?: boolean;
          id?: string;
          image_url?: string | null;
          is_paid?: boolean;
          is_public?: boolean;
          lat?: number | null;
          lng?: number | null;
          organization_id?: string | null;
          starts_at: string;
          state?: string;
          status?: string;
          tags?: string[] | null;
          ticket_price_cents?: number | null;
          title: string;
          venue?: string | null;
        };
        Update: {
          address?: string | null;
          age_restriction?: string | null;
          capacity?: number | null;
          category?: string | null;
          city?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          ends_at?: string | null;
          featured?: boolean;
          id?: string;
          image_url?: string | null;
          is_paid?: boolean;
          is_public?: boolean;
          lat?: number | null;
          lng?: number | null;
          organization_id?: string | null;
          starts_at?: string;
          state?: string;
          status?: string;
          tags?: string[] | null;
          ticket_price_cents?: number | null;
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
          event_id: string | null;
          id: string;
          opportunity_id: string | null;
          points: number;
          profile_id: string;
          redemption_id: string | null;
          source: string | null;
        };
        Insert: {
          amount_cents?: number;
          created_at?: string;
          description?: string | null;
          entry_type: string;
          event_id?: string | null;
          id?: string;
          opportunity_id?: string | null;
          points?: number;
          profile_id: string;
          redemption_id?: string | null;
          source?: string | null;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          description?: string | null;
          entry_type?: string;
          event_id?: string | null;
          id?: string;
          opportunity_id?: string | null;
          points?: number;
          profile_id?: string;
          redemption_id?: string | null;
          source?: string | null;
        };
        Relationships: [
          { foreignKeyName: "flow_ledger_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "events"; referencedColumns: ["id"] },
          { foreignKeyName: "flow_ledger_opportunity_id_fkey"; columns: ["opportunity_id"]; isOneToOne: false; referencedRelation: "opportunities"; referencedColumns: ["id"] },
          { foreignKeyName: "flow_ledger_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "flow_ledger_redemption_id_fkey"; columns: ["redemption_id"]; isOneToOne: false; referencedRelation: "reward_redemptions"; referencedColumns: ["id"] },
        ];
      };
      messages: {
        Row: { body: string; conversation_id: string; created_at: string; deleted_at: string | null; deleted_by: string | null; id: string; sender_id: string };
        Insert: { body: string; conversation_id: string; created_at?: string; deleted_at?: string | null; deleted_by?: string | null; id?: string; sender_id: string };
        Update: { body?: string; conversation_id?: string; created_at?: string; deleted_at?: string | null; deleted_by?: string | null; id?: string; sender_id?: string };
        Relationships: [
          { foreignKeyName: "messages_conversation_id_fkey"; columns: ["conversation_id"]; isOneToOne: false; referencedRelation: "conversations"; referencedColumns: ["id"] },
          { foreignKeyName: "messages_deleted_by_fkey"; columns: ["deleted_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "messages_sender_id_fkey"; columns: ["sender_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      notifications: {
        Row: { body: string | null; created_at: string; href: string | null; id: string; profile_id: string; read: boolean; title: string; type: string };
        Insert: { body?: string | null; created_at?: string; href?: string | null; id?: string; profile_id: string; read?: boolean; title: string; type: string };
        Update: { body?: string | null; created_at?: string; href?: string | null; id?: string; profile_id?: string; read?: boolean; title?: string; type?: string };
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
          org_type: string;
          owner_id: string;
          state: string | null;
          verification_requested_at: string | null;
          verified: boolean;
        };
        Insert: {
          city?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          org_type?: string;
          owner_id: string;
          state?: string | null;
          verification_requested_at?: string | null;
          verified?: boolean;
        };
        Update: {
          city?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          org_type?: string;
          owner_id?: string;
          state?: string | null;
          verification_requested_at?: string | null;
          verified?: boolean;
        };
        Relationships: [
          { foreignKeyName: "organizations_owner_id_fkey"; columns: ["owner_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      profile_achievements: {
        Row: { achievement_key: string; earned_at: string; profile_id: string };
        Insert: { achievement_key: string; earned_at?: string; profile_id: string };
        Update: { achievement_key?: string; earned_at?: string; profile_id?: string };
        Relationships: [
          { foreignKeyName: "profile_achievements_achievement_key_fkey"; columns: ["achievement_key"]; isOneToOne: false; referencedRelation: "achievements"; referencedColumns: ["key"] },
          { foreignKeyName: "profile_achievements_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      profile_skills: {
        Row: { profile_id: string; skill_id: string; verified: boolean; verified_at: string | null };
        Insert: { profile_id: string; skill_id: string; verified?: boolean; verified_at?: string | null };
        Update: { profile_id?: string; skill_id?: string; verified?: boolean; verified_at?: string | null };
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
      reward_redemptions: {
        Row: { created_at: string; id: string; points_spent: number; profile_id: string; redemption_code: string; reward_id: string; status: string };
        Insert: { created_at?: string; id?: string; points_spent: number; profile_id: string; redemption_code: string; reward_id: string; status?: string };
        Update: { created_at?: string; id?: string; points_spent?: number; profile_id?: string; redemption_code?: string; reward_id?: string; status?: string };
        Relationships: [
          { foreignKeyName: "reward_redemptions_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reward_redemptions_reward_id_fkey"; columns: ["reward_id"]; isOneToOne: false; referencedRelation: "rewards"; referencedColumns: ["id"] },
        ];
      };
      rewards: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          eligibility: string | null;
          ends_at: string | null;
          id: string;
          inventory: number | null;
          partner: string;
          points_required: number;
          redeemed_count: number;
          redemption_instructions: string | null;
          starts_at: string | null;
          status: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          eligibility?: string | null;
          ends_at?: string | null;
          id?: string;
          inventory?: number | null;
          partner: string;
          points_required: number;
          redeemed_count?: number;
          redemption_instructions?: string | null;
          starts_at?: string | null;
          status?: string;
          title: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          eligibility?: string | null;
          ends_at?: string | null;
          id?: string;
          inventory?: number | null;
          partner?: string;
          points_required?: number;
          redeemed_count?: number;
          redemption_instructions?: string | null;
          starts_at?: string | null;
          status?: string;
          title?: string;
        };
        Relationships: [
          { foreignKeyName: "rewards_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      skills: {
        Row: { category: string | null; created_at: string; id: string; name: string };
        Insert: { category?: string | null; created_at?: string; id?: string; name: string };
        Update: { category?: string | null; created_at?: string; id?: string; name?: string };
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
    Functions: {
      block_profile: { Args: { p_target_id: string }; Returns: Json };
      cancel_connection_request: { Args: { p_connection_id: string }; Returns: Json };
      check_in_ticket: {
        Args: { p_checkin_code?: string; p_event_id: string; p_method?: string; p_profile_id?: string };
        Returns: Json;
      };
      delete_message: { Args: { p_message_id: string }; Returns: Json };
      evaluate_achievements: { Args: { p_profile_id: string }; Returns: undefined };
      get_my_blocked_profiles: {
        Args: Record<PropertyKey, never>;
        Returns: { avatar_url: string | null; blocked_at: string; city: string; connection_id: string; full_name: string | null; profile_id: string; state: string; username: string | null }[];
      };
      get_or_create_direct_conversation: { Args: { p_other_id: string }; Returns: Json };
      get_or_create_event_conversation: { Args: { p_event_id: string }; Returns: Json };
      get_or_create_opportunity_conversation: { Args: { p_applicant_id?: string; p_opportunity_id: string }; Returns: Json };
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean };
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: Json };
      mark_no_show: { Args: { p_event_id: string; p_profile_id: string }; Returns: Json };
      maybe_fill_opportunity: { Args: { p_opportunity_id: string }; Returns: undefined };
      notify: { Args: { p_body: string; p_href: string; p_profile_id: string; p_title: string; p_type: string }; Returns: undefined };
      recompute_reliability: { Args: { p_profile_id: string }; Returns: undefined };
      redeem_reward: { Args: { p_reward_id: string }; Returns: Json };
      remove_connection: { Args: { p_connection_id: string }; Returns: Json };
      report_profile: { Args: { p_details?: string; p_reason: string; p_target_id: string }; Returns: Json };
      respond_to_connection_request: { Args: { p_action: string; p_connection_id: string }; Returns: Json };
      send_connection_request: { Args: { p_recipient_id: string }; Returns: Json };
      send_message: { Args: { p_body: string; p_conversation_id: string }; Returns: Json };
      unblock_profile: { Args: { p_target_id: string }; Returns: Json };
    };
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
export type AttendanceStatus = "registered" | "attended" | "no_show" | "cancelled";
export type ConnectionStatus = "pending" | "accepted" | "blocked";
export type ConnectionAction = "sent" | "accepted" | "declined" | "cancelled" | "removed" | "blocked" | "unblocked";

export interface ConnectionRpcResult {
  ok: boolean;
  reason?: "not_authenticated" | "self" | "not_found" | "blocked" | "already_connected" | "already_pending" | "not_authorized" | "not_pending" | "not_connected" | "not_blocked" | "invalid_action" | "missing_reason" | "unknown_state";
  status?: ConnectionStatus | "declined" | "cancelled" | "removed" | "unblocked";
  connection_id?: string;
  auto_accepted?: boolean;
}

export type ConversationType = "direct" | "event" | "opportunity";

export interface ConversationRpcResult {
  ok: boolean;
  reason?: "not_authenticated" | "self" | "blocked" | "not_connected" | "event_not_found" | "not_authorized" | "opportunity_not_found" | "applicant_required" | "not_an_applicant";
  conversation_id?: string;
}

export interface MessageRpcResult {
  ok: boolean;
  reason?: "not_authenticated" | "empty" | "too_long" | "not_a_member" | "blocked" | "rate_limited" | "not_found" | "not_authorized";
  message_id?: string;
}

export type NotificationType =
  | "application_submitted"
  | "application_accepted"
  | "application_rejected"
  | "opportunity_changed"
  | "opportunity_cancelled"
  | "gig_reminder"
  | "completion_confirmed"
  | "recommendation_received"
  | "ticket_reserved"
  | "event_reminder"
  | "event_changed"
  | "event_cancelled"
  | "checkin_success"
  | "points_earned"
  | "achievement_unlocked"
  | "reward_redeemed"
  | "connection_request"
  | "connection_accepted"
  | "message_received";
export type EventCategory =
  | "Networking"
  | "Career"
  | "Hiring"
  | "Community"
  | "Music"
  | "Arts"
  | "Technology"
  | "Education"
  | "Sports/Fitness"
  | "Entrepreneurship"
  | "Government/Civic"
  | "Volunteer"
  | "FLOW Official";

export interface CheckInResult {
  ok: boolean;
  reason?: "event_not_found" | "not_authorized" | "no_identifier" | "invalid_code" | "wrong_event" | "cancelled" | "no_show" | "already_checked_in";
  checked_in_at?: string;
  attendee_name?: string;
}

export interface RedeemResult {
  ok: boolean;
  redemption_id?: string;
  code?: string;
}
