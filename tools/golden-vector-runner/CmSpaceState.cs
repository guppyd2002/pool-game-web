using System.Collections.Generic;

namespace CalculableMechanics
{
    [System.Serializable]
    public class CmSpaceState
    {
        public CmRigidbodyState[] States { get; private set; }

        public CmSpaceState(CmRigidbodyState[] states)
        {
            States = states;
        }

        public CmSpaceState(CmSpace cmSpace)
        {
            States = new CmRigidbodyState[cmSpace.Rigidbodies.Count];
            for (int i = 0; i < States.Length; i++)
            {
                States[i] = new CmRigidbodyState(cmSpace.Rigidbodies[i]);
            }
        }

        /// <summary>
        /// Tos the state of the string. for example "state1|state2...|state7"
        /// </summary>
        /// <returns>The string state.</returns>
        public string ToStringState()
        {
            string stringState = "";

            for (int i = 0; i < States.Length - 1; i++)
            {
                stringState += States[i].ToStringState() + "|";
            }
            if (States.Length - 1 >= 0)
            {
                stringState += States[States.Length - 1].ToStringState();
            }
            return stringState;
        }
        public CmSpaceState(string stringState)
        {
            string str = "";
            List<CmRigidbodyState> statesList = new List<CmRigidbodyState>(0);
            foreach (var item in stringState)
            {
                if (item == '|')
                {
                    statesList.Add(new CmRigidbodyState(str));
                    str = "";
                }
                else
                {
                    str += item;
                }
            }
            statesList.Add(new CmRigidbodyState(str));
            States = statesList.ToArray();
        }
    }
}
