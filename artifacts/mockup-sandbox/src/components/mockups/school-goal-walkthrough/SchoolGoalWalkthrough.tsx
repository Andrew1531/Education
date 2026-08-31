import { useState } from 'react';
import './_group.css';

const goals = [
  'Select a goal',
  'University Admission',
  'Employment / HR',
  'Professional Licensing',
  'Immigration (USCIS)',
];

export function SchoolGoalWalkthrough() {
  const [goal, setGoal] = useState('University Admission');

  return (
    <main className="school-walkthrough">
      <div className="school-walkthrough__eyebrow">
        <span className="school-walkthrough__dot" />
        Acting test · no submission
      </div>
      <h1>Choose the path you want to explore</h1>
      <p className="school-walkthrough__intro">
        This is the point where a user tells VerifED that they are looking for schooling.
        The school finder appears only after this goal is selected.
      </p>

      <div className="school-walkthrough__layout">
        <section className="school-walkthrough__card" aria-label="Create account acting test">
          <h2>Create an account</h2>
          <p className="school-walkthrough__muted">
            Temporary values are shown for demonstration. Nothing is being sent.
          </p>

          <div className="school-walkthrough__field">
            <label className="school-walkthrough__label" htmlFor="walkthrough-username">
              Username
            </label>
            <input
              id="walkthrough-username"
              className="school-walkthrough__input"
              value="school-seeker-demo"
              readOnly
            />
          </div>

          <div className="school-walkthrough__field">
            <label className="school-walkthrough__label" htmlFor="walkthrough-goal">
              Primary goal
            </label>
            <select
              id="walkthrough-goal"
              className="school-walkthrough__select"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              aria-describedby="walkthrough-goal-status"
            >
              {goals.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div id="walkthrough-goal-status" className="school-walkthrough__status" role="status">
            <span className="school-walkthrough__check">✓</span>
            <span>
              {goal === 'University Admission'
                ? 'University Admission selected. The school finder is now the next step.'
                : 'A non-school goal is selected. The school finder stays hidden.'}
            </span>
          </div>

          <button className="school-walkthrough__button" type="button" disabled>
            Create Account &amp; Access Evaluator
          </button>
        </section>

        <aside className="school-walkthrough__side" aria-label="Acting test steps">
          <div className="school-walkthrough__step">
            <div className="school-walkthrough__step-number">STEP 01</div>
            <strong>Open account creation</strong>
            <span>Enter basic information.</span>
          </div>
          <div className="school-walkthrough__step school-walkthrough__step--active">
            <div className="school-walkthrough__step-number">STEP 02</div>
            <strong>Select University Admission</strong>
            <span>This activates the school-only path.</span>
          </div>
          <div className="school-walkthrough__step">
            <div className="school-walkthrough__step-number">STEP 03</div>
            <strong>Continue to evaluation</strong>
            <span>No email is sent at this stage.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}