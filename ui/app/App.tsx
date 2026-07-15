import { Page } from "@dynatrace/strato-components-preview/layouts";
import React from "react";
import { Route, Routes } from "react-router-dom";
import { Header } from "./components/Header";
import { ViewLibrary } from "./pages/ViewLibrary";
import { ViewPage } from "./pages/ViewPage";

export const App = () => {
  return (
    <Page>
      <Page.Header>
        <Header />
      </Page.Header>
      <Page.Main>
        <Routes>
          <Route path="/" element={<ViewLibrary />} />
          <Route path="/view/:id" element={<ViewPage />} />
        </Routes>
      </Page.Main>
    </Page>
  );
};
