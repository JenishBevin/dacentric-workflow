import React, { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Send } from "lucide-react";
import { Avatar, Button, Textarea } from "../ui/primitives";
import { useAddComment, useTaskComments } from "../../api/tasks";
import { useEmployeeDirectory } from "../../api/misc";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";

interface Comment {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
}

/** Section 27: comments with @mention autocomplete; mentioned users are notified server-side. */
export const CommentsSection: React.FC<{ taskId: string }> = ({ taskId }) => {
  const { push } = useToast();
  const { data: comments, isLoading } = useTaskComments(taskId);
  const addComment = useAddComment(taskId);
  const [body, setBody] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentioned, setMentioned] = useState<Record<string, string>>({}); // name -> userId
  const { data: employees } = useEmployeeDirectory(mentionQuery ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionMatches = useMemo(() => (mentionQuery === null ? [] : (employees ?? []).slice(0, 6)), [mentionQuery, employees]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);
    const upToCursor = val.slice(0, e.target.selectionStart ?? val.length);
    const match = /@([\w.-]*)$/.exec(upToCursor);
    setMentionQuery(match ? match[1] : null);
  }

  function pickMention(name: string, userId: string) {
    const cursor = textareaRef.current?.selectionStart ?? body.length;
    const upToCursor = body.slice(0, cursor);
    const replaced = upToCursor.replace(/@([\w.-]*)$/, `@${name} `);
    setBody(replaced + body.slice(cursor));
    setMentioned((m) => ({ ...m, [name]: userId }));
    setMentionQuery(null);
  }

  async function submit() {
    if (!body.trim()) return;
    const mentionedUserIds = Object.entries(mentioned)
      .filter(([name]) => body.includes(`@${name}`))
      .map(([, id]) => id);
    try {
      await addComment.mutateAsync({ body: body.trim(), mentionedUserIds });
      setBody("");
      setMentioned({});
    } catch (err) {
      push({ variant: "error", title: "Could not post comment", description: extractApiError(err).message });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-500">Comments</p>

      <div className="space-y-3">
        {isLoading && <p className="text-xs text-slate-400">Loading comments…</p>}
        {comments?.length === 0 && <p className="text-xs text-slate-400">No comments yet. Be the first to say something.</p>}
        {comments?.map((c: Comment) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar name={c.authorName} size="sm" />
            <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">{c.authorName}</p>
                <p className="shrink-0 text-[11px] text-slate-400">{format(new Date(c.createdAt), "d MMM, HH:mm")}</p>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative">
        <Textarea ref={textareaRef} rows={2} placeholder="Write a comment… use @ to mention someone" value={body} onChange={handleChange} />
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-0 z-20 mb-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            {mentionMatches.map((e) => (
              <button
                key={e.userId}
                type="button"
                onClick={() => pickMention(e.name, e.userId)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
              >
                <Avatar name={e.name} size="xs" /> {e.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={submit} loading={addComment.isPending} disabled={!body.trim()}>
            <Send className="h-3.5 w-3.5" /> Post
          </Button>
        </div>
      </div>
    </div>
  );
};
