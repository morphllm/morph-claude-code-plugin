export interface SubagentStartInput {
  agent_id?: string;
  agent_type?: string;
  session_id?: string;
  cwd?: string;
}

export interface UserPromptSubmitInput {
  prompt?: string;
  session_id?: string;
  cwd?: string;
  permission_mode?: string;
}
