class Strings
{
    public static isNullOrEmpty(str: string | null) : boolean
    {
        return !str || !str.trim();
    }
}