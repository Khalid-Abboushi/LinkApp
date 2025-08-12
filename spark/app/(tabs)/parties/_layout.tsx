import React from "react";
import { Stack } from "expo-router";

export default function PartiesStack() {
  // Everything under /parties is a stack (index -> [id], etc.)
  return <Stack screenOptions={{ headerShown: false }} />;
}
