import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { OfflineBanner } from '../components/OfflineBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { apiRequest } from '../services/api';
import { theme } from '../theme/tokens';

type Shift = {
  id: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  active: boolean;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ShiftScheduleScreen() {
  const insets = useSafeAreaInsets();
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(17);
  const [isAdding, setIsAdding] = useState(false);

  const {
    data: shifts,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Shift[]>({
    queryKey: ['driver-shifts'],
    queryFn: () => apiRequest('/drivers/me/shifts'),
  });

  const handleAddShift = async () => {
    if (startHour >= endHour) {
      Alert.alert('Invalid time', 'End time must be after start time.');
      return;
    }
    setIsAdding(true);
    try {
      await apiRequest('/drivers/me/shifts', {
        method: 'POST',
        body: JSON.stringify({ dayOfWeek: selectedDay, startHour, endHour }),
      });
      refetch();
    } catch {
      Alert.alert('Error', 'Could not add shift.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    Alert.alert('Delete shift', 'Are you sure you want to remove this shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiRequest(`/drivers/me/shifts/${shiftId}`, { method: 'DELETE' });
            refetch();
          } catch {
            Alert.alert('Error', 'Could not delete shift.');
          }
        },
      },
    ]);
  };

  const formatHour = (h: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:00 ${ampm}`;
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: 16 }}>
        <SkeletonBlock height={28} width={120} />
        <SkeletonBlock height={80} borderRadius={12} />
        <SkeletonBlock height={200} borderRadius={12} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas, padding: 16 }}>
        <OfflineBanner />
        <ErrorState
          title="Could not load shifts"
          message={error instanceof Error ? error.message : 'Please try again.'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
      >
        <OfflineBanner />

        <Text
          style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink, marginBottom: 16 }}
        >
          Shift Schedule
        </Text>

        {/* Day selector */}
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            padding: 16,
            gap: 10,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
            Select day
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {DAYS.map((day, i) => (
              <Pressable
                key={i}
                onPress={() => setSelectedDay(i)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: selectedDay === i ? theme.colors.primary : theme.colors.canvas,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: selectedDay === i ? '#fff' : theme.colors.muted,
                    fontWeight: '700',
                    fontSize: 12,
                  }}
                >
                  {day}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Time picker */}
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            padding: 16,
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
            Set hours
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Start</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {[6, 8, 10, 12, 14, 16].map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => setStartHour(h)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                      backgroundColor: startHour === h ? theme.colors.primary : theme.colors.canvas,
                    }}
                  >
                    <Text
                      style={{
                        color: startHour === h ? '#fff' : theme.colors.muted,
                        fontWeight: '700',
                        fontSize: 11,
                      }}
                    >
                      {formatHour(h)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>End</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {[14, 16, 18, 20, 22, 24].map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => setEndHour(h === 24 ? 0 : h)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                      backgroundColor:
                        endHour === (h === 24 ? 0 : h) ? theme.colors.primary : theme.colors.canvas,
                    }}
                  >
                    <Text
                      style={{
                        color: endHour === (h === 24 ? 0 : h) ? '#fff' : theme.colors.muted,
                        fontWeight: '700',
                        fontSize: 11,
                      }}
                    >
                      {h === 24 ? '12:00 AM' : formatHour(h)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <Button
            label="Add shift"
            icon={<Plus size={18} color="#fff" />}
            onPress={handleAddShift}
            loading={isAdding}
          />
        </View>

        {/* Existing shifts */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
            My Shifts
          </Text>
          {!shifts || shifts.length === 0 ? (
            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: 24,
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Calendar size={32} color={theme.colors.muted} />
              <Text style={{ color: theme.colors.muted }}>No shifts scheduled</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 13, textAlign: 'center' }}>
                Add shifts to auto go-online at scheduled times.
              </Text>
            </View>
          ) : (
            shifts.map((shift) => (
              <View
                key={shift.id}
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: theme.colors.primary + '15',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Clock size={20} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.ink, fontWeight: '800' }}>
                    {DAYS[shift.dayOfWeek]}
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
                    {formatHour(shift.startHour)} — {formatHour(shift.endHour)}
                  </Text>
                </View>
                <Pressable onPress={() => handleDeleteShift(shift.id)}>
                  <Trash2 size={18} color={theme.colors.danger} />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
