/** Rail Announcements Generator. By Roy Curtis, MIT license, 2018 */

/** Sugar for choosing second value if first is undefined, instead of falsy */
function either<T>(value: T | undefined, value2: T) : T
{
    return (value === undefined || value === null) ? value2 : value;
}