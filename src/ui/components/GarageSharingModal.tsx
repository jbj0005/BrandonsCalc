/**
 * GarageSharingModal - Modal for sharing garage with others
 *
 * Allows users to:
 * - Generate public view-only share links
 * - Invite others by email with role-based access (viewer/manager)
 * - Manage and revoke existing share links
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';
import { useToast } from './Toast';
import type { GarageShareLink } from '../../types';
import {
  createGarageShareLink,
  listGarageShareLinks,
  createGarageInvite,
  revokeGarageShareLink,
  sendGarageInviteEmail,
} from '../../lib/supabase';

export interface GarageSharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export const GarageSharingModal: React.FC<GarageSharingModalProps> = ({
  isOpen,
  onClose,
  userId,
}) => {
  const toast = useToast();

  // Share links state
  const [shareLinks, setShareLinks] = useState<GarageShareLink[]>([]);
  const [latestShareUrl, setLatestShareUrl] = useState<string | null>(null);
  const [latestShareToken, setLatestShareToken] = useState<string | null>(null);
  const [isLoadingShareLinks, setIsLoadingShareLinks] = useState(false);
  const [isCreatingShareLink, setIsCreatingShareLink] = useState(false);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'manager'>('viewer');
  const [isSendingInvite, setIsSendingInvite] = useState(false);

  // Build share URL from token
  const buildShareUrl = useCallback((token: string) => {
    if (typeof window === 'undefined') return token;
    return `${window.location.origin}/share/${token}`;
  }, []);

  // Load share links when modal opens
  useEffect(() => {
    const loadShareLinks = async () => {
      if (!isOpen || !userId) return;
      setIsLoadingShareLinks(true);
      try {
        const links = await listGarageShareLinks(userId);
        setShareLinks(links || []);
      } catch (error: any) {
        toast.push({
          kind: 'error',
          title: 'Unable to load share links',
          detail: error?.message || 'Please try again',
        });
      } finally {
        setIsLoadingShareLinks(false);
      }
    };
    loadShareLinks();
  }, [isOpen, userId, toast]);

  // Reset latest share URL when modal closes
  useEffect(() => {
    if (!isOpen) {
      setLatestShareUrl(null);
      setLatestShareToken(null);
    }
  }, [isOpen]);

  const handleCreateShareLink = useCallback(async () => {
    try {
      setIsCreatingShareLink(true);
      const link = await createGarageShareLink({
        garageOwnerId: userId,
      });
      if (link) {
        const url = buildShareUrl(link.token);
        setLatestShareUrl(url);
        setLatestShareToken(link.token);
        setShareLinks((prev) => [link, ...(prev || []).filter((l) => l.id !== link.id)]);
        toast.push({
          kind: 'success',
          title: 'Share link created',
          detail: 'Copy the link to share your garage.',
        });
      }
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: 'Could not create link',
        detail: error?.message || 'Please try again.',
      });
    } finally {
      setIsCreatingShareLink(false);
    }
  }, [userId, buildShareUrl, toast]);

  const handleCopyShareUrl = useCallback(async (token: string) => {
    const url = buildShareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      toast.push({ kind: 'success', title: 'Link copied', detail: 'Send this to anyone to view your garage.' });
    } catch (error) {
      toast.push({ kind: 'error', title: 'Could not copy link', detail: url });
    }
  }, [buildShareUrl, toast]);

  const handleRevokeShareLink = useCallback(async (linkId: string) => {
    try {
      await revokeGarageShareLink(linkId);
      setShareLinks((prev) => (prev || []).filter((link) => link.id !== linkId));
      toast.push({ kind: 'success', title: 'Link revoked' });
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: 'Could not revoke link',
        detail: error?.message || 'Please try again.',
      });
    }
  }, [toast]);

  const handleCreateInvite = useCallback(async () => {
    if (!inviteEmail) {
      toast.push({ kind: 'info', title: 'Add an email', detail: 'Enter an email to send an invite.' });
      return;
    }
    try {
      setIsSendingInvite(true);
      const invite = await createGarageInvite({
        garageOwnerId: userId,
        email: inviteEmail,
        role: inviteRole,
        expiresAt: null,
        invitedBy: userId,
      });
      if (invite) {
        if (invite.token) {
          try {
            await sendGarageInviteEmail({
              email: invite.email,
              token: invite.token,
              role: inviteRole,
              garageOwnerId: userId,
              invitedBy: userId,
              appUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
            });
            toast.push({
              kind: 'success',
              title: 'Invite sent',
              detail: `Invitation emailed to ${invite.email}`,
            });
          } catch (sendError: any) {
            toast.push({
              kind: 'warning',
              title: 'Invite created (email not sent)',
              detail: `Share this code with ${invite.email}: ${invite.token}`,
            });
          }
        } else {
          toast.push({
            kind: 'success',
            title: 'Invite created',
            detail: `Share this code with ${invite.email}: ${invite.token}`,
          });
        }
        setInviteEmail('');
      }
    } catch (error: any) {
      toast.push({
        kind: 'error',
        title: 'Could not send invite',
        detail: error?.message || 'Please try again.',
      });
    } finally {
      setIsSendingInvite(false);
    }
  }, [userId, inviteEmail, inviteRole, toast]);

  const activeLinks = shareLinks.filter((l) => !l.revoked_at);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share Your Garage"
      size="md"
      isNested
    >
      <div className="space-y-6">
        {/* Generate Link Section */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">Public Share Link</p>
              <p className="text-xs text-white/60">
                Generate a view-only link anyone can use to see your garage.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateShareLink}
              loading={isCreatingShareLink}
              className="whitespace-nowrap"
            >
              Generate Link
            </Button>
          </div>

          {latestShareUrl && latestShareToken && (
            <div className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-400/30 rounded-lg px-3 py-2">
              <span className="truncate flex-1 text-emerald-100">{latestShareUrl}</span>
              <button
                onClick={() => handleCopyShareUrl(latestShareToken)}
                className="px-3 py-1.5 text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/20 rounded border border-emerald-400/40 transition-colors"
              >
                Copy
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Email Invite Section */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-white">Invite by Email</p>
            <p className="text-xs text-white/60">
              Send an invitation with specific access permissions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr] gap-3">
            <Input
              label="Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@example.com"
              fullWidth
            />
            <div className="space-y-1">
              <label className="text-xs text-white/60">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'viewer' | 'manager')}
                className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              >
                <option value="viewer">Viewer (read-only)</option>
                <option value="manager">Manager (add/update)</option>
              </select>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCreateInvite}
            loading={isSendingInvite}
            disabled={!inviteEmail}
            fullWidth
          >
            Send Invite
          </Button>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Active Links List */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-white">Active Links</p>

          {isLoadingShareLinks ? (
            <p className="text-xs text-white/60">Loading share links...</p>
          ) : activeLinks.length === 0 ? (
            <p className="text-xs text-white/60">No active links yet.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {activeLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-start sm:items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate">
                      {buildShareUrl(link.token)}
                    </p>
                    <p className="text-[11px] text-white/60 mt-0.5">
                      {link.expires_at
                        ? `Expires ${new Date(link.expires_at).toLocaleDateString()}`
                        : 'No expiry'}{' '}
                      · Views {link.current_views ?? 0}
                      {link.max_views ? ` / ${link.max_views}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleCopyShareUrl(link.token)}
                      className="text-xs px-2 py-1 rounded border border-white/20 text-white hover:bg-white/10 transition-colors"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => handleRevokeShareLink(link.id)}
                      className="text-xs px-2 py-1 rounded border border-red-300/40 text-red-100 hover:bg-red-500/10 transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-white/10">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default GarageSharingModal;
