import React from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  FlatList,
  Dimensions,
  Platform,
} from "react-native";
import Card from "@/components/Card";
import { useTheme } from "@/providers/ThemeProvider";

export default function Map() {
  const theme = useTheme();
  return (
    <View>
      <Text style={{ fontSize: 24, fontWeight: "800", color: theme.colors.text.primary, marginBottom: 8 }}>
        Map
      </Text>
      <Card>
        <Text style={{ color: theme.colors.text.muted }}>
          Real-time pins & ETAs coming soon.
        </Text>
      </Card>
    </View>
  );
}
