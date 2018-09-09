/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

// Global methods for asserting the existence of values. To keep the chance of errors
// within asserts low, no localization is used here.

/** Asserts that the given value exists; neither undefined nor null */
function assert<T>(value: T) : T
{
    if (value === undefined || value === null)
        throw AssertError('Value does not exist', assert);

    return value;
}

/** Asserts that the given value exists and is a number */
function assertNumber(value: number) : void
{
    if ( typeof value !== 'number' || isNaN(value) )
        throw AssertError('Value is not a number', assertNumber);
}

/** Creates an assertion error that begins the stack at the assert's call site  */
function AssertError(message: any, caller: Function) : Error
{
    let error = Error(`Assertion failed: ${message}`);

    if (Error.captureStackTrace)
        Error.captureStackTrace(error, caller);

    return error;
}