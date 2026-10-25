import { View, Text, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { colors, spacing } from "@/src/theme";
import { Chip } from "@/src/ui";

export type TeamMember = { id: string; name: string; role: string };

export function useTeam(): TeamMember[] {
  const q = useQuery({ queryKey: ["team"], queryFn: () => api<TeamMember[]>("/team") });
  return q.data ?? [];
}

export function teamNames(team: TeamMember[], ids: string[] = []) {
  return ids.map((id) => team.find((t) => t.id === id)?.name).filter(Boolean) as string[];
}

export function AssigneeChips({
  team, selected, onChange, label = "Atanan Çalışanlar", testIDPrefix = "assignee",
}: {
  team: TeamMember[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  testIDPrefix?: string;
}) {
  const employees = team.filter((t) => t.role === "employee");
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <View>
      {!!label && (
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary, fontWeight: "600", marginBottom: spacing.xs }}>
          {label}
        </Text>
      )}
      {employees.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>Önce Ayarlar'dan çalışan ekleyin.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
          {employees.map((e) => (
            <Chip
              key={e.id}
              testID={`${testIDPrefix}-${e.id}`}
              label={selected.includes(e.id) ? `✓ ${e.name}` : e.name}
              active={selected.includes(e.id)}
              onPress={() => toggle(e.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
