export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          description: string
          icon: string
          key: string
          points_bonus: number
          title: string
        }
        Insert: {
          description: string
          icon: string
          key: string
          points_bonus?: number
          title: string
        }
        Update: {
          description?: string
          icon?: string
          key?: string
          points_bonus?: number
          title?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      admins: {
        Row: {
          active: boolean
          created_at: string
          granted_by: string | null
          profile_id: string
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          granted_by?: string | null
          profile_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          granted_by?: string | null
          profile_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admins_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admins_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admins_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      applications: {
        Row: {
          accepted_at: string | null
          applicant_id: string
          cancelled_by: string | null
          created_at: string
          id: string
          opportunity_id: string
          resolved_at: string | null
          responded_at: string | null
          status: string
          worker_ack_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          applicant_id: string
          cancelled_by?: string | null
          created_at?: string
          id?: string
          opportunity_id: string
          resolved_at?: string | null
          responded_at?: string | null
          status?: string
          worker_ack_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          applicant_id?: string
          cancelled_by?: string | null
          created_at?: string
          id?: string
          opportunity_id?: string
          resolved_at?: string | null
          responded_at?: string | null
          status?: string
          worker_ack_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "applications_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      business_contacts: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_decision_maker: boolean
          lead_id: string
          notes: string | null
          phone: string | null
          preferred_method: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_decision_maker?: boolean
          lead_id: string
          notes?: string | null
          phone?: string | null
          preferred_method?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_decision_maker?: boolean
          lead_id?: string
          notes?: string | null
          phone?: string | null
          preferred_method?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      business_leads: {
        Row: {
          address: string | null
          archived: boolean
          archived_at: string | null
          archived_by: string | null
          archived_reason: string | null
          assigned_to: string | null
          best_contact_method: string | null
          business_name: string
          category: string
          city: string
          consent_notes: string | null
          created_at: string
          created_by: string
          general_email: string | null
          general_phone: string | null
          hiring_frequency: string | null
          id: string
          interest_level: string
          last_contact_at: string | null
          neighborhood: string | null
          next_action: string | null
          next_action_at: string | null
          notes: string | null
          organization_id: string | null
          pipeline_stage: string
          postal_code: string | null
          region: string
          social_url: string | null
          source: string | null
          staffing_problems: string | null
          typical_roles: string[]
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          archived?: boolean
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          assigned_to?: string | null
          best_contact_method?: string | null
          business_name: string
          category: string
          city?: string
          consent_notes?: string | null
          created_at?: string
          created_by?: string
          general_email?: string | null
          general_phone?: string | null
          hiring_frequency?: string | null
          id?: string
          interest_level?: string
          last_contact_at?: string | null
          neighborhood?: string | null
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          organization_id?: string | null
          pipeline_stage?: string
          postal_code?: string | null
          region?: string
          social_url?: string | null
          source?: string | null
          staffing_problems?: string | null
          typical_roles?: string[]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          archived?: boolean
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          assigned_to?: string | null
          best_contact_method?: string | null
          business_name?: string
          category?: string
          city?: string
          consent_notes?: string | null
          created_at?: string
          created_by?: string
          general_email?: string | null
          general_phone?: string | null
          hiring_frequency?: string | null
          id?: string
          interest_level?: string
          last_contact_at?: string | null
          neighborhood?: string | null
          next_action?: string | null
          next_action_at?: string | null
          notes?: string | null
          organization_id?: string | null
          pipeline_stage?: string
          postal_code?: string | null
          region?: string
          social_url?: string | null
          source?: string | null
          staffing_problems?: string | null
          typical_roles?: string[]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_leads_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_leads_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_leads_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          recipient_id: string
          requester_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          recipient_id: string
          requester_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          recipient_id?: string
          requester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "connection_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "connection_events_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_events_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_events_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      connection_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_id: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "connection_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      connections: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          recipient_id: string
          requester_id: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          recipient_id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "connections_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "connections_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      conversations: {
        Row: {
          applicant_id: string | null
          created_at: string
          created_by: string
          event_id: string | null
          id: string
          last_message_at: string
          opportunity_id: string | null
          type: string
        }
        Insert: {
          applicant_id?: string | null
          created_at?: string
          created_by: string
          event_id?: string | null
          id?: string
          last_message_at?: string
          opportunity_id?: string | null
          type: string
        }
        Update: {
          applicant_id?: string | null
          created_at?: string
          created_by?: string
          event_id?: string | null
          id?: string
          last_message_at?: string
          opportunity_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "conversations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_types: {
        Row: {
          color_token: string
          description: string
          icon_name: string
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          color_token: string
          description: string
          icon_name: string
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          color_token?: string
          description?: string
          icon_name?: string
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      employer_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          intended_email: string | null
          lead_id: string
          replaces_invitation_id: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at: string
          id?: string
          intended_email?: string | null
          lead_id: string
          replaces_invitation_id?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          intended_email?: string | null
          lead_id?: string
          replaces_invitation_id?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "employer_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employer_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employer_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "employer_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employer_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employer_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "employer_invitations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "business_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employer_invitations_replaces_invitation_id_fkey"
            columns: ["replaces_invitation_id"]
            isOneToOne: false
            referencedRelation: "employer_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance: {
        Row: {
          cancelled_at: string | null
          check_in_method: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checkin_code: string
          event_id: string
          id: string
          price_cents: number
          profile_id: string
          reserved_at: string
          status: string
          ticket_type: string
        }
        Insert: {
          cancelled_at?: string | null
          check_in_method?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkin_code: string
          event_id: string
          id?: string
          price_cents?: number
          profile_id: string
          reserved_at?: string
          status?: string
          ticket_type?: string
        }
        Update: {
          cancelled_at?: string | null
          check_in_method?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkin_code?: string
          event_id?: string
          id?: string
          price_cents?: number
          profile_id?: string
          reserved_at?: string
          status?: string
          ticket_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          age_restriction: string | null
          capacity: number | null
          category: string | null
          city: string
          created_at: string
          created_by: string
          description: string | null
          ends_at: string | null
          featured: boolean
          id: string
          image_url: string | null
          is_paid: boolean
          is_public: boolean
          lat: number | null
          lng: number | null
          organization_id: string | null
          starts_at: string
          state: string
          status: string
          tags: string[] | null
          ticket_price_cents: number | null
          title: string
          venue: string | null
        }
        Insert: {
          address?: string | null
          age_restriction?: string | null
          capacity?: number | null
          category?: string | null
          city?: string
          created_at?: string
          created_by: string
          description?: string | null
          ends_at?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          is_paid?: boolean
          is_public?: boolean
          lat?: number | null
          lng?: number | null
          organization_id?: string | null
          starts_at: string
          state?: string
          status?: string
          tags?: string[] | null
          ticket_price_cents?: number | null
          title: string
          venue?: string | null
        }
        Update: {
          address?: string | null
          age_restriction?: string | null
          capacity?: number | null
          category?: string | null
          city?: string
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          is_paid?: boolean
          is_public?: boolean
          lat?: number | null
          lng?: number | null
          organization_id?: string | null
          starts_at?: string
          state?: string
          status?: string
          tags?: string[] | null
          ticket_price_cents?: number | null
          title?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_ledger: {
        Row: {
          amount_cents: number
          created_at: string
          description: string | null
          entry_type: string
          event_id: string | null
          id: string
          opportunity_id: string | null
          points: number
          profile_id: string
          redemption_id: string | null
          source: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description?: string | null
          entry_type: string
          event_id?: string | null
          id?: string
          opportunity_id?: string | null
          points?: number
          profile_id: string
          redemption_id?: string | null
          source?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string | null
          entry_type?: string
          event_id?: string | null
          id?: string
          opportunity_id?: string | null
          points?: number
          profile_id?: string
          redemption_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_ledger_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_ledger_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_ledger_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_ledger_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_ledger_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "flow_ledger_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "reward_redemptions"
            referencedColumns: ["id"]
          },
        ]
      }
      founding_class_grants: {
        Row: {
          created_at: string
          granted_by: string | null
          profile_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          profile_id: string
          reason: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          profile_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "founding_class_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "founding_class_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "founding_class_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "founding_class_grants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "founding_class_grants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "founding_class_grants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      lead_organization_links: {
        Row: {
          lead_id: string
          linked_at: string
          linked_by: string
          organization_id: string
        }
        Insert: {
          lead_id: string
          linked_at?: string
          linked_by?: string
          organization_id: string
        }
        Update: {
          lead_id?: string
          linked_at?: string
          linked_by?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_organization_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "business_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_organization_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_organization_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_organization_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lead_organization_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage_history: {
        Row: {
          changed_at: string
          changed_by: string
          from_stage: string | null
          id: string
          lead_id: string
          note: string | null
          to_stage: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string
          from_stage?: string | null
          id?: string
          lead_id: string
          note?: string | null
          to_stage: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          from_stage?: string | null
          id?: string
          lead_id?: string
          note?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      match_recommendations: {
        Row: {
          acted_at: string | null
          created_at: string
          dismissed_at: string | null
          expires_at: string
          id: string
          profile_id: string
          reasons: string[]
          recommendation_type: string
          score: number
          signals: Json
          target_opportunity_id: string | null
          target_profile_id: string | null
          target_skill_id: string | null
        }
        Insert: {
          acted_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          expires_at?: string
          id?: string
          profile_id: string
          reasons?: string[]
          recommendation_type: string
          score?: number
          signals?: Json
          target_opportunity_id?: string | null
          target_profile_id?: string | null
          target_skill_id?: string | null
        }
        Update: {
          acted_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          expires_at?: string
          id?: string
          profile_id?: string
          reasons?: string[]
          recommendation_type?: string
          score?: number
          signals?: Json
          target_opportunity_id?: string | null
          target_profile_id?: string | null
          target_skill_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_recommendations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_recommendations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_recommendations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_recommendations_target_opportunity_id_fkey"
            columns: ["target_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_recommendations_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_recommendations_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_recommendations_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "match_recommendations_target_skill_id_fkey"
            columns: ["target_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      member_intents: {
        Row: {
          active: boolean
          availability: string | null
          created_at: string
          expires_at: string | null
          goal: string | null
          id: string
          intent_type: string
          location_city: string | null
          location_state: string | null
          profile_id: string
          radius_miles: number | null
          remote_preference: string
          target_categories: string[]
          target_skills: string[]
          updated_at: string
          visible: boolean
        }
        Insert: {
          active?: boolean
          availability?: string | null
          created_at?: string
          expires_at?: string | null
          goal?: string | null
          id?: string
          intent_type: string
          location_city?: string | null
          location_state?: string | null
          profile_id: string
          radius_miles?: number | null
          remote_preference?: string
          target_categories?: string[]
          target_skills?: string[]
          updated_at?: string
          visible?: boolean
        }
        Update: {
          active?: boolean
          availability?: string | null
          created_at?: string
          expires_at?: string | null
          goal?: string | null
          id?: string
          intent_type?: string
          location_city?: string | null
          location_state?: string | null
          profile_id?: string
          radius_miles?: number | null
          remote_preference?: string
          target_categories?: string[]
          target_skills?: string[]
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "member_intents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_intents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_intents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          href: string | null
          id: string
          profile_id: string
          read: boolean
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          profile_id: string
          read?: boolean
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          profile_id?: string
          read?: boolean
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      opportunities: {
        Row: {
          category: string | null
          city: string
          created_at: string
          created_by: string
          description: string | null
          ends_at: string | null
          id: string
          instant_book: boolean
          is_remote: boolean
          lat: number | null
          lng: number | null
          location_name: string | null
          opportunity_type: string
          organization_id: string | null
          pay_cents: number | null
          slots: number
          starts_at: string | null
          state: string
          status: string
          title: string
        }
        Insert: {
          category?: string | null
          city?: string
          created_at?: string
          created_by: string
          description?: string | null
          ends_at?: string | null
          id?: string
          instant_book?: boolean
          is_remote?: boolean
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          opportunity_type: string
          organization_id?: string | null
          pay_cents?: number | null
          slots?: number
          starts_at?: string | null
          state?: string
          status?: string
          title: string
        }
        Update: {
          category?: string | null
          city?: string
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          instant_book?: boolean
          is_remote?: boolean
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          opportunity_type?: string
          organization_id?: string | null
          pay_cents?: number | null
          slots?: number
          starts_at?: string | null
          state?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_skill_requirements: {
        Row: {
          opportunity_id: string
          required: boolean
          skill_id: string
        }
        Insert: {
          opportunity_id: string
          required?: boolean
          skill_id: string
        }
        Update: {
          opportunity_id?: string
          required?: boolean
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_skill_requirements_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_skill_requirements_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_verification_cases: {
        Row: {
          assigned_to: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          decision_reason_code: string | null
          findings: Json
          id: string
          lead_id: string | null
          organization_id: string | null
          requirements: Json
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          decision_reason_code?: string | null
          findings?: Json
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          requirements?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          decision_reason_code?: string | null
          findings?: Json
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          requirements?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_verification_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_verification_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_verification_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "organization_verification_cases_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_verification_cases_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_verification_cases_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "organization_verification_cases_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "business_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_verification_cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          city: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          org_type: string
          owner_id: string
          state: string | null
          verification_requested_at: string | null
          verified: boolean
        }
        Insert: {
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_type?: string
          owner_id: string
          state?: string | null
          verification_requested_at?: string | null
          verified?: boolean
        }
        Update: {
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_type?: string
          owner_id?: string
          state?: string | null
          verification_requested_at?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      outreach_activities: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string
          documents_sent: string[]
          follow_up_at: string | null
          id: string
          interest_level: string | null
          lead_id: string
          method: string
          notes: string | null
          objections: string | null
          occurred_at: string
          outcome: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string
          documents_sent?: string[]
          follow_up_at?: string | null
          id?: string
          interest_level?: string | null
          lead_id: string
          method: string
          notes?: string | null
          objections?: string | null
          occurred_at?: string
          outcome: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string
          documents_sent?: string[]
          follow_up_at?: string | null
          id?: string
          interest_level?: string | null
          lead_id?: string
          method?: string
          notes?: string | null
          objections?: string | null
          occurred_at?: string
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "business_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "outreach_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_tasks: {
        Row: {
          assigned_to: string | null
          auto_generated: boolean
          completed_at: string | null
          created_at: string
          created_by: string
          details: string | null
          due_at: string
          id: string
          lead_id: string | null
          status: string
          task_type: string
          title: string
          trigger_key: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          auto_generated?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string
          details?: string | null
          due_at: string
          id?: string
          lead_id?: string | null
          status?: string
          task_type?: string
          title: string
          trigger_key?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          auto_generated?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string
          details?: string | null
          due_at?: string
          id?: string
          lead_id?: string | null
          status?: string
          task_type?: string
          title?: string
          trigger_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "outreach_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "outreach_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_templates: {
        Row: {
          active: boolean
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      pilot_agreements: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string
          id: string
          internal_notes: string | null
          lead_id: string
          offered_at: string | null
          status: string
          terms_summary: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          internal_notes?: string | null
          lead_id: string
          offered_at?: string | null
          status?: string
          terms_summary?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          internal_notes?: string | null
          lead_id?: string
          offered_at?: string | null
          status?: string
          terms_summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_agreements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_agreements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_agreements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "pilot_agreements_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "business_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      profile_achievements: {
        Row: {
          achievement_key: string
          earned_at: string
          profile_id: string
        }
        Insert: {
          achievement_key: string
          earned_at?: string
          profile_id: string
        }
        Update: {
          achievement_key?: string
          earned_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_achievements_achievement_key_fkey"
            columns: ["achievement_key"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "profile_achievements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_achievements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_achievements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      profile_credentials: {
        Row: {
          credential_type: string
          granted_at: string
          id: string
          profile_id: string
          revoked_at: string | null
          source_id: string | null
          source_table: string | null
          title: string
        }
        Insert: {
          credential_type: string
          granted_at?: string
          id?: string
          profile_id: string
          revoked_at?: string | null
          source_id?: string | null
          source_table?: string | null
          title: string
        }
        Update: {
          credential_type?: string
          granted_at?: string
          id?: string
          profile_id?: string
          revoked_at?: string | null
          source_id?: string | null
          source_table?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_credentials_credential_type_fkey"
            columns: ["credential_type"]
            isOneToOne: false
            referencedRelation: "credential_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "profile_credentials_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_credentials_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_credentials_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      profile_skills: {
        Row: {
          profile_id: string
          skill_id: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          profile_id: string
          skill_id: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          profile_id?: string
          skill_id?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          available_now: boolean
          avatar_url: string | null
          bio: string | null
          city: string
          created_at: string
          flow_points: number
          full_name: string | null
          id: string
          public_passport: boolean
          reliability_score: number
          state: string
          updated_at: string
          username: string | null
        }
        Insert: {
          available_now?: boolean
          avatar_url?: string | null
          bio?: string | null
          city?: string
          created_at?: string
          flow_points?: number
          full_name?: string | null
          id: string
          public_passport?: boolean
          reliability_score?: number
          state?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          available_now?: boolean
          avatar_url?: string | null
          bio?: string | null
          city?: string
          created_at?: string
          flow_points?: number
          full_name?: string | null
          id?: string
          public_passport?: boolean
          reliability_score?: number
          state?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          opportunity_id: string | null
          rating: number | null
          recipient_id: string
          skills_demonstrated: string[] | null
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          opportunity_id?: string | null
          rating?: number | null
          recipient_id: string
          skills_demonstrated?: string[] | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          opportunity_id?: string | null
          rating?: number | null
          recipient_id?: string
          skills_demonstrated?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "recommendations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      referrals: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          expires_at: string
          id: string
          intended_email: string | null
          referrer_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          expires_at: string
          id?: string
          intended_email?: string | null
          referrer_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          intended_email?: string | null
          referrer_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          created_at: string
          id: string
          points_spent: number
          profile_id: string
          redemption_code: string
          reward_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          points_spent: number
          profile_id: string
          redemption_code: string
          reward_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          points_spent?: number
          profile_id?: string
          redemption_code?: string
          reward_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          eligibility: string | null
          ends_at: string | null
          id: string
          inventory: number | null
          partner: string
          points_required: number
          redeemed_count: number
          redemption_instructions: string | null
          starts_at: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          eligibility?: string | null
          ends_at?: string | null
          id?: string
          inventory?: number | null
          partner: string
          points_required: number
          redeemed_count?: number
          redemption_instructions?: string | null
          starts_at?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          eligibility?: string | null
          ends_at?: string | null
          id?: string
          inventory?: number | null
          partner?: string
          points_required?: number
          redeemed_count?: number
          redemption_instructions?: string | null
          starts_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      skills: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      verification_decisions: {
        Row: {
          actor_id: string
          case_id: string
          created_at: string
          from_status: string | null
          id: string
          notes: string | null
          reason_code: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string
          case_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          reason_code?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string
          case_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          notes?: string | null
          reason_code?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_decisions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_decisions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_decisions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "verification_decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "organization_verification_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_reviews: {
        Row: {
          actor_id: string
          created_at: string
          from_status: string | null
          id: string
          method: string | null
          notes: string | null
          reason_code: string | null
          to_status: string
          verification_id: string
        }
        Insert: {
          actor_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          reason_code?: string | null
          to_status: string
          verification_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          reason_code?: string | null
          to_status?: string
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_reviews_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_reviews_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_reviews_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "verification_reviews_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      verifications: {
        Row: {
          created_at: string
          credential_type: string
          evidence_note: string | null
          evidence_url: string | null
          expires_at: string | null
          id: string
          profile_id: string
          reference_id: string | null
          reference_table: string | null
          revoked_at: string | null
          source: string
          status: string
          title: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          credential_type: string
          evidence_note?: string | null
          evidence_url?: string | null
          expires_at?: string | null
          id?: string
          profile_id: string
          reference_id?: string | null
          reference_table?: string | null
          revoked_at?: string | null
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          credential_type?: string
          evidence_note?: string | null
          evidence_url?: string | null
          expires_at?: string | null
          id?: string
          profile_id?: string
          reference_id?: string | null
          reference_table?: string | null
          revoked_at?: string | null
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verifications_credential_type_fkey"
            columns: ["credential_type"]
            isOneToOne: false
            referencedRelation: "credential_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "verifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "passport_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "reliability_breakdown"
            referencedColumns: ["profile_id"]
          },
        ]
      }
    }
    Views: {
      passport_summary: {
        Row: {
          available_now: boolean | null
          city: string | null
          earned_cents: number | null
          events_attended: number | null
          flow_points: number | null
          full_name: string | null
          gigs_completed: number | null
          id: string | null
          recommendations: number | null
          reliability_score: number | null
          skills_verified: number | null
          state: string | null
          username: string | null
        }
        Insert: {
          available_now?: boolean | null
          city?: string | null
          earned_cents?: never
          events_attended?: never
          flow_points?: number | null
          full_name?: string | null
          gigs_completed?: never
          id?: string | null
          recommendations?: never
          reliability_score?: number | null
          skills_verified?: never
          state?: string | null
          username?: string | null
        }
        Update: {
          available_now?: boolean | null
          city?: string | null
          earned_cents?: never
          events_attended?: never
          flow_points?: number | null
          full_name?: string | null
          gigs_completed?: never
          id?: string | null
          recommendations?: never
          reliability_score?: number | null
          skills_verified?: never
          state?: string | null
          username?: string | null
        }
        Relationships: []
      }
      reliability_breakdown: {
        Row: {
          currently_accepted: number | null
          gigs_completed: number | null
          no_shows: number | null
          profile_id: string | null
          reliability_score: number | null
          withdrawn_before_start: number | null
          worker_cancellations: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_employer_invitation: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      accept_referral: { Args: { p_token_hash: string }; Returns: Json }
      block_profile: { Args: { p_target_id: string }; Returns: Json }
      cancel_connection_request: {
        Args: { p_connection_id: string }
        Returns: Json
      }
      change_lead_stage: {
        Args: { p_lead_id: string; p_new_stage: string; p_note?: string }
        Returns: Json
      }
      check_in_ticket: {
        Args: {
          p_checkin_code?: string
          p_event_id: string
          p_method?: string
          p_profile_id?: string
        }
        Returns: Json
      }
      complete_invited_employer_onboarding: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      decide_evidence_verification: {
        Args: {
          p_expires_at?: string
          p_method?: string
          p_new_status: string
          p_notes?: string
          p_reason_code?: string
          p_verification_id: string
        }
        Returns: Json
      }
      decide_verification_case: {
        Args: {
          p_assigned_to?: string
          p_case_id: string
          p_new_status: string
          p_notes?: string
          p_reason_code?: string
        }
        Returns: Json
      }
      delete_message: { Args: { p_message_id: string }; Returns: Json }
      evaluate_achievements: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      generate_match_recommendations: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      generate_onboarding_followup_tasks: { Args: never; Returns: Json }
      get_my_blocked_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          blocked_at: string
          city: string
          connection_id: string
          full_name: string
          profile_id: string
          state: string
          username: string
        }[]
      }
      get_or_create_direct_conversation: {
        Args: { p_other_id: string }
        Returns: Json
      }
      get_or_create_event_conversation: {
        Args: { p_event_id: string }
        Returns: Json
      }
      get_or_create_opportunity_conversation: {
        Args: { p_applicant_id?: string; p_opportunity_id: string }
        Returns: Json
      }
      grant_founding_class: {
        Args: { p_profile_id: string; p_reason: string }
        Returns: Json
      }
      import_business_leads: { Args: { p_rows: Json }; Returns: Json }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      is_conversation_member: {
        Args: { p_conversation_id: string; p_profile_id: string }
        Returns: boolean
      }
      is_flow_admin: { Args: { require_aal2?: boolean }; Returns: boolean }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      mark_no_show: {
        Args: { p_event_id: string; p_profile_id: string }
        Returns: Json
      }
      maybe_fill_opportunity: {
        Args: { p_opportunity_id: string }
        Returns: undefined
      }
      notify: {
        Args: {
          p_body: string
          p_href: string
          p_profile_id: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      recompute_reliability: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      redeem_reward: { Args: { p_reward_id: string }; Returns: Json }
      remove_connection: { Args: { p_connection_id: string }; Returns: Json }
      report_profile: {
        Args: { p_details?: string; p_reason: string; p_target_id: string }
        Returns: Json
      }
      respond_to_connection_request: {
        Args: { p_action: string; p_connection_id: string }
        Returns: Json
      }
      send_connection_request: {
        Args: { p_recipient_id: string }
        Returns: Json
      }
      send_message: {
        Args: { p_body: string; p_conversation_id: string }
        Returns: Json
      }
      unblock_profile: { Args: { p_target_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

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

// ── Admin Batch 2 RPC result shapes ──────────────────────────────────────
// Mirrors the jsonb each function actually returns (see
// supabase/migrations/20260819050000_admin_batch2_operations.sql) — these
// aren't in the Supabase-generated schema because Postgres only declares
// the return type as `jsonb`/Json, not its internal shape.

export interface StageChangeResult {
  ok: boolean;
  reason?: "not_authorized" | "not_found";
}

export interface VerificationDecisionResult {
  ok: boolean;
  reason?: "not_authorized" | "not_found";
}

export interface ImportLeadsResult {
  ok: boolean;
  reason?: "not_authorized" | "empty_batch" | "batch_too_large";
  created?: number;
  updated?: number;
}

export interface GenerateFollowupsResult {
  ok: boolean;
  reason?: "not_authorized";
  created?: number;
}

// ── V1+ Passport/Trust/Matching RPC result shapes ────────────────────────
// Same reasoning as above: jsonb-typed at the SQL level, real shape here.

export interface EvidenceDecisionResult {
  ok: boolean;
  reason?: "not_authorized" | "not_found";
}

export interface ReferralAcceptRpcResult {
  ok: boolean;
  reason?: "not_authenticated" | "invalid_or_expired" | "self_referral" | "email_mismatch" | "already_claimed";
  already_accepted?: boolean;
}

export interface FoundingClassGrantResult {
  ok: boolean;
  reason?: "not_authorized";
}

export interface GenerateMatchesResult {
  ok: boolean;
  reason?: "not_authenticated" | "not_authorized";
  generated?: number;
}
