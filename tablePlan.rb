Table user

id
email
password_hash
created_at


Table leads

id
user_id
name
contact
notes
status
last_activity_at
created_at

Table reminders

id
lead_id
type        -- follow_up / payment
trigger_at
is_done

Table ai_logs

id
lead_id
purpose     -- follow_up / payment
content
created_at
