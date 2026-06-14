import { useTheme, ThemeProvider } from "@/components/providers/ThemeProvider";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
});

function Probe() {
    const { theme, setTheme } = useTheme();

    return (
        <div>
            <div data-testid="theme-value">{theme}</div>
            <button type="button" onClick={() => setTheme("dark")}>
                Set dark
            </button>
        </div>
    );
}

test("ThemeProvider defaults to neutral and persists theme updates", async () => {
    const user = userEvent.setup();

    render(
        <ThemeProvider>
            <Probe />
        </ThemeProvider>
    );

    expect(screen.getByTestId("theme-value")).toHaveTextContent("neutral");

    await user.click(screen.getByRole("button", { name: "Set dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("traderdiary-theme")).toBe("dark");
});
