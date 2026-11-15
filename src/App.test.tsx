import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App shell", () => {
  it("shows the placeholder page", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "To-do" })).toBeInTheDocument();
  });
});
