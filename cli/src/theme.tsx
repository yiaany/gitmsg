import { createContext, useContext } from "react";
import { themeById, type Palette } from "./themes";

export const ThemeContext = createContext<Palette>(themeById().colors);
export const useTheme = () => useContext(ThemeContext);
