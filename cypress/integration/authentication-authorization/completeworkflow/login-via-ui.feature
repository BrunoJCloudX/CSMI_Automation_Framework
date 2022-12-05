@login-via-ui
Feature: Login via UI

  Scenario: Login to CS using UI

    * Login to CS using UI, check if it redirects to "/mainpage" and sets the cookies
    * Clear browser cookies
    * Try a login attempt with invalid credentials, check if it returns 401 and displays error and displays error message notification.