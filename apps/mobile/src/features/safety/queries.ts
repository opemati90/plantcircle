import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import type { ReportInput, StaffAction } from '../../lib/backend/types';
import { useAuth } from '../auth/useAuth';

/** Everything a block changes: People, chats, requests and the Inbox. */
const AFTER_BLOCK = [
  ['people'],
  ['blocked'],
  ['conversation'],
  ['messages'],
  ['directRequests'],
  ['inbox'],
];

export function useBlocked() {
  const backend = useBackend();
  const { session } = useAuth();
  return useQuery({
    queryKey: ['blocked', session?.userId ?? null],
    queryFn: () => backend.listBlocked(),
    enabled: !!session,
  });
}

export function useBlockUser() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; key: string }) =>
      backend.blockUser(input.userId, input.key),
    onSuccess: () =>
      Promise.all(AFTER_BLOCK.map((key) => queryClient.invalidateQueries({ queryKey: key }))),
  });
}

export function useUnblockUser() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => backend.unblockUser(userId),
    onSuccess: () =>
      Promise.all(AFTER_BLOCK.map((key) => queryClient.invalidateQueries({ queryKey: key }))),
  });
}

export function useCreateReport() {
  const backend = useBackend();
  return useMutation({
    mutationFn: (input: { report: ReportInput; key: string }) =>
      backend.createReport(input.report, input.key),
  });
}

export function useSuspension() {
  const backend = useBackend();
  const { session, profile } = useAuth();
  return useQuery({
    queryKey: ['suspension', session?.userId ?? null, profile?.status ?? null],
    queryFn: () => backend.getSuspension(),
    enabled: !!session,
  });
}

export function useCreateAppeal() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { actionId: string; statement: string; key: string }) =>
      backend.createAppeal(input.actionId, input.statement, input.key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suspension'] }),
  });
}

// Staff console (web).

const STAFF_KEYS = [
  ['staffQueue'],
  ['staffCase'],
  ['staffAppeals'],
  ['staffAudit'],
  ['profile'],
  ['suspension'],
];

export function useStaffQueue(enabled: boolean) {
  const backend = useBackend();
  return useQuery({
    queryKey: ['staffQueue'],
    queryFn: () => backend.staffQueue(),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useStaffCase(reportId: string | null) {
  const backend = useBackend();
  return useQuery({
    queryKey: ['staffCase', reportId],
    queryFn: () => backend.staffCase(reportId ?? ''),
    enabled: reportId !== null,
  });
}

export function useStaffDecide() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      reportId: string;
      action: StaffAction;
      reason: string;
      rule: string | null;
      until: string | null;
      key: string;
    }) => backend.staffDecide(input, input.key),
    onSuccess: () =>
      Promise.all(STAFF_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: key }))),
  });
}

export function useStaffViewMessages() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reportId: string; reason: string }) =>
      backend.staffViewMessages(input.reportId, input.reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staffAudit'] }),
  });
}

export function useStaffAppeals(enabled: boolean) {
  const backend = useBackend();
  return useQuery({
    queryKey: ['staffAppeals'],
    queryFn: () => backend.staffAppeals(),
    enabled,
  });
}

export function useStaffCities(enabled: boolean) {
  const backend = useBackend();
  return useQuery({ queryKey: ['staffCities'], queryFn: () => backend.staffCities(), enabled });
}

export function useStaffCityMerge() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { fromId: string; intoId: string; reason: string; key: string }) =>
      backend.staffCityMerge(input.fromId, input.intoId, input.reason, input.key),
    onSuccess: () =>
      Promise.all(
        [['staffCities'], ['staffAudit'], ['cities']].map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      ),
  });
}

export function useStaffAppealDecide() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { appealId: string; uphold: boolean; reason: string; key: string }) =>
      backend.staffAppealDecide(input.appealId, input.uphold, input.reason, input.key),
    onSuccess: () =>
      Promise.all(STAFF_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: key }))),
  });
}

export function useStaffAudit(enabled: boolean) {
  const backend = useBackend();
  return useQuery({
    queryKey: ['staffAudit'],
    queryFn: () => backend.staffAudit(100),
    enabled,
  });
}
